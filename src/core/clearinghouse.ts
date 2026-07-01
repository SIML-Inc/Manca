// The Manca clearinghouse. The neutral bilateral layer where any agent's buy
// mandate meets any agent's sell offer, funds are escrowed, fulfillment is
// machine-verified, settlement is atomic, reputation compounds, and revenue
// accrues — all with zero humans when the verification rule is machine-adjudicable.
import { id, verifyPayload } from "./crypto.ts";
import { Store } from "./store.ts";
import { RevenueEngine } from "./revenue.ts";
import { verifyFulfillment } from "./fulfillment.ts";
import type { HttpProbe, VerdictResult } from "./fulfillment.ts";
import { applyOutcome, autonomousSpendLimit, riskAdjustedPremiumBps } from "./reputation.ts";
import type {
  Account,
  BuyMandate,
  SellOffer,
  Trade,
  MancaConfig,
  VerificationRule,
} from "../types.ts";

export interface BuyMandateInput {
  buyerId: string;
  category: string;
  spec: Record<string, unknown>;
  maxPrice: number;
  minReputation: number;
  referencePrice?: number;
  insured: boolean;
  verification: VerificationRule;
  deadline: number;
}

export interface SellOfferInput {
  sellerId: string;
  category: string;
  attributes: Record<string, unknown>;
  price: number;
  slaSeconds: number;
  available: number;
}

export class MancaError extends Error {}

export class Clearinghouse {
  store: Store;
  cfg: MancaConfig;
  revenue: RevenueEngine;
  insurancePool: number;
  private httpProbe: HttpProbe | undefined;

  constructor(store: Store, cfg: MancaConfig, httpProbe?: HttpProbe) {
    this.store = store;
    this.cfg = cfg;
    this.revenue = new RevenueEngine(store, cfg);
    this.httpProbe = httpProbe;
    this.insurancePool = cfg.insurance.poolFloor;
  }

  private acc(id: string): Account {
    const a = this.store.accounts.get(id);
    if (!a) throw new MancaError(`unknown account ${id}`);
    return a;
  }

  register(label: string, publicKey: string): Account {
    const acc: Account = {
      id: id("acct"),
      label,
      publicKey,
      balance: 0,
      escrowLocked: 0,
      reputation: this.cfg.reputation.startScore,
      successfulTrades: 0,
      failedTrades: 0,
      verifiedSupplier: false,
      createdAt: Date.now(),
    };
    this.store.accounts.set(acc.id, acc);
    return acc;
  }

  deposit(accountId: string, amount: number): Account {
    if (amount <= 0) throw new MancaError("deposit must be positive");
    const a = this.acc(accountId);
    a.balance = round(a.balance + amount);
    return a;
  }

  // A seller opts into verified supply (better discovery + eligibility). Booked
  // as recurring subscription revenue — real money independent of any trade.
  enableVerifiedSupplier(accountId: string): Account {
    const a = this.acc(accountId);
    if (!a.verifiedSupplier) {
      a.verifiedSupplier = true;
      this.revenue.record(
        "verified_supply_subscription",
        this.cfg.verifiedSupply.subscriptionMonthlyUsd,
        "verified-supply subscription",
        undefined,
        a.id,
      );
    }
    return a;
  }

  postBuyMandate(input: BuyMandateInput, signature: string): BuyMandate {
    const buyer = this.acc(input.buyerId);
    if (!verifyPayload(buyer.publicKey, canonicalMandate(input), signature))
      throw new MancaError("invalid buyer signature on mandate");
    if (input.maxPrice < this.cfg.clearing.minTradeValue)
      throw new MancaError("maxPrice below network minimum trade value");
    const m: BuyMandate = {
      id: id("mnd"),
      ...input,
      signature,
      createdAt: Date.now(),
      status: "open",
    };
    this.store.mandates.set(m.id, m);
    return m;
  }

  postSellOffer(input: SellOfferInput, signature: string): SellOffer {
    const seller = this.acc(input.sellerId);
    if (!verifyPayload(seller.publicKey, canonicalOffer(input), signature))
      throw new MancaError("invalid seller signature on offer");
    if (seller.reputation < this.cfg.risk.minReputationToSell)
      throw new MancaError("seller reputation below minimum to sell");
    if (this.cfg.verifiedSupply.verificationRequired && !seller.verifiedSupplier)
      throw new MancaError("seller must be a verified supplier to post offers");
    const o: SellOffer = {
      id: id("off"),
      ...input,
      signature,
      createdAt: Date.now(),
      active: true,
    };
    this.store.offers.set(o.id, o);
    return o;
  }

  // Best offer = cheapest offer that meets spec, price ceiling, and reputation
  // floor — reputation-weighted so a slightly pricier trusted seller can win.
  findMatch(mandateId: string): SellOffer | null {
    const m = this.store.mandates.get(mandateId);
    if (!m || m.status !== "open") return null;
    let best: SellOffer | null = null;
    let bestScore = Infinity;
    for (const o of this.store.offers.values()) {
      if (!o.active || o.available <= 0) continue;
      if (o.category !== m.category) continue;
      if (o.price > m.maxPrice) continue;
      const seller = this.store.accounts.get(o.sellerId);
      if (!seller || seller.reputation < m.minReputation) continue;
      // lower is better: price penalized upward as reputation drops
      const repFactor = 1 + (this.cfg.reputation.maxScore - seller.reputation) / this.cfg.reputation.maxScore;
      const score = o.price * repFactor;
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best;
  }

  match(mandateId: string): Trade {
    const m = this.store.mandates.get(mandateId);
    if (!m) throw new MancaError("unknown mandate");
    if (m.status !== "open") throw new MancaError(`mandate not open (${m.status})`);
    const offer = this.findMatch(mandateId);
    if (!offer) throw new MancaError("no eligible offer matches this mandate");

    const buyer = this.acc(m.buyerId);
    const seller = this.acc(offer.sellerId);
    const price = offer.price;

    // Authority gate: is this within the buyer agent's autonomous spend limit?
    if (price > autonomousSpendLimit(this.cfg, buyer))
      throw new MancaError(
        `price ${price} exceeds buyer autonomous spend limit ${autonomousSpendLimit(this.cfg, buyer)} — human approval required`,
      );

    const clearingFee = this.revenue.clearingFee(price);
    const premiumBps = m.insured ? riskAdjustedPremiumBps(this.cfg, seller.reputation) : 0;
    const insurancePremium = m.insured ? round((price * premiumBps) / 10_000) : 0;

    const buyerClearingFee = this.cfg.clearing.clearingFeePayer === "seller" ? 0
      : this.cfg.clearing.clearingFeePayer === "split" ? round(clearingFee / 2)
      : clearingFee;
    const escrowLock = round(price + buyerClearingFee); // premium handled via pool
    const totalDebit = round(escrowLock + insurancePremium);

    if (buyer.balance < totalDebit)
      throw new MancaError(
        `insufficient balance: need ${totalDebit}, have ${buyer.balance}`,
      );

    // Lock funds. Premium moves straight into the insurance pool.
    buyer.balance = round(buyer.balance - totalDebit);
    buyer.escrowLocked = round(buyer.escrowLocked + escrowLock);
    this.insurancePool = round(this.insurancePool + insurancePremium);

    offer.available -= 1;
    if (offer.available <= 0) offer.active = false;
    m.status = "matched";

    const trade: Trade = {
      id: id("trd"),
      mandateId: m.id,
      offerId: offer.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      price,
      clearingFee,
      insurancePremium,
      insured: m.insured,
      referencePrice: m.referencePrice,
      lockedAt: Date.now(),
      status: "matched",
      verification: m.verification,
      deadline: m.deadline,
      fulfillmentAttempts: 0,
    };
    this.store.trades.set(trade.id, trade);
    return trade;
  }

  async submitFulfillment(
    tradeId: string,
    payload: unknown,
  ): Promise<{ trade: Trade; verdict: VerdictResult }> {
    const trade = this.store.trades.get(tradeId);
    if (!trade) throw new MancaError("unknown trade");
    if (trade.status !== "matched") throw new MancaError(`trade not open (${trade.status})`);
    trade.fulfillmentAttempts += 1;

    const verdict = await verifyFulfillment(trade.verification, payload, this.httpProbe);
    if (!verdict.verified) return { trade, verdict };

    this.settle(trade);
    return { trade, verdict };
  }

  private settle(trade: Trade): void {
    const buyer = this.acc(trade.buyerId);
    const seller = this.acc(trade.sellerId);

    const buyerClearingFee = this.cfg.clearing.clearingFeePayer === "seller" ? 0
      : this.cfg.clearing.clearingFeePayer === "split" ? round(trade.clearingFee / 2)
      : trade.clearingFee;
    const sellerClearingFee = round(trade.clearingFee - buyerClearingFee);
    const escrowLock = round(trade.price + buyerClearingFee);

    // Release escrow: seller is paid price minus their share of the clearing fee.
    buyer.escrowLocked = round(buyer.escrowLocked - escrowLock);
    const sellerProceeds = round(trade.price - sellerClearingFee);
    seller.balance = round(seller.balance + sellerProceeds);

    // Revenue: clearing fee + float earned in flight + realized savings share.
    const heldMs = Date.now() - trade.lockedAt;
    this.revenue.record("clearing_fee", trade.clearingFee, "cleared + guaranteed", trade.id);
    const fy = this.revenue.floatYield(escrowLock, heldMs);
    if (fy > 0) this.revenue.record("float_yield", fy, `float on ${escrowLock} for ${heldMs}ms`, trade.id);
    const ss = this.revenue.savingsShare(trade.referencePrice, trade.price);
    if (ss > 0) this.revenue.record("savings_share", ss, "share of realized savings", trade.id);
    // Insured trade settled cleanly: the reserved premium is now earned. Move it
    // OUT of the pool as it becomes revenue (no double-counting against payouts).
    if (trade.insured && trade.insurancePremium > 0) {
      this.insurancePool = round(this.insurancePool - trade.insurancePremium);
      this.revenue.record("insurance_premium", trade.insurancePremium, "insured trade settled — premium earned", trade.id);
    }

    // Reputation compounds for both sides on a clean settlement.
    applyOutcome(this.cfg, seller, true);
    applyOutcome(this.cfg, buyer, true);

    trade.status = "settled";
    trade.settledAt = Date.now();
    const m = this.store.mandates.get(trade.mandateId);
    if (m) m.status = "settled";
  }

  // Expire overdue matched trades: refund the buyer from escrow, pay insurance
  // compensation if covered, and penalize the seller's reputation.
  expire(now: number = Date.now()): number {
    let failed = 0;
    for (const trade of this.store.trades.values()) {
      if (trade.status !== "matched") continue;
      if (now < trade.deadline) continue;

      const buyer = this.acc(trade.buyerId);
      const seller = this.acc(trade.sellerId);
      const buyerClearingFee = this.cfg.clearing.clearingFeePayer === "seller" ? 0
        : this.cfg.clearing.clearingFeePayer === "split" ? round(trade.clearingFee / 2)
        : trade.clearingFee;
      const escrowLock = round(trade.price + buyerClearingFee);

      // Full escrow refund to the buyer.
      buyer.escrowLocked = round(buyer.escrowLocked - escrowLock);
      buyer.balance = round(buyer.balance + escrowLock);

      // Insurance: pay the buyer coverage from the pool (bounded by pool balance).
      if (trade.insured) {
        const coverage = round(trade.price * this.cfg.insurance.maxCoverageMultiple);
        const payout = Math.min(coverage, this.insurancePool);
        if (payout > 0) {
          this.insurancePool = round(this.insurancePool - payout);
          buyer.balance = round(buyer.balance + payout);
          this.revenue.record("insurance_premium", -payout, "insurance payout on failure", trade.id);
        }
      }

      applyOutcome(this.cfg, seller, false);
      trade.status = "failed";
      trade.failReason = "fulfillment deadline missed";
      const m = this.store.mandates.get(trade.mandateId);
      if (m) m.status = "failed";
      failed += 1;
    }
    // Expire stale open mandates.
    for (const m of this.store.mandates.values()) {
      if (m.status === "open" && now >= m.deadline) m.status = "expired";
    }
    return failed;
  }

  accountView(accountId: string) {
    const a = this.acc(accountId);
    return { ...a, autonomousSpendLimit: autonomousSpendLimit(this.cfg, a) };
  }

  revenueReport() {
    return {
      networkId: this.cfg.network.id,
      total: round(this.revenue.total()),
      breakdown: this.revenue.breakdown(),
      insurancePool: round(this.insurancePool),
      trades: this.store.trades.size,
      settled: [...this.store.trades.values()].filter((t) => t.status === "settled").length,
      failed: [...this.store.trades.values()].filter((t) => t.status === "failed").length,
    };
  }
}

// Canonical payload builders — buyer/seller sign exactly these fields.
export function canonicalMandate(i: BuyMandateInput) {
  return {
    buyerId: i.buyerId,
    category: i.category,
    spec: i.spec,
    maxPrice: i.maxPrice,
    minReputation: i.minReputation,
    referencePrice: i.referencePrice ?? null,
    insured: i.insured,
    verification: i.verification,
    deadline: i.deadline,
  };
}
export function canonicalOffer(i: SellOfferInput) {
  return {
    sellerId: i.sellerId,
    category: i.category,
    attributes: i.attributes,
    price: i.price,
    slaSeconds: i.slaSeconds,
    available: i.available,
  };
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
