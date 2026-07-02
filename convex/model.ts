// The Manca clearinghouse, expressed as helper functions over a Convex
// MutationCtx. Ported from the SDK's clearinghouse.ts. Because Convex mutations
// are ACID, escrow can never double-spend under concurrency — the match →
// escrow → verify → settle path is one atomic transaction.
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { MANCA_CONFIG, round } from "./lib/config";
import {
  clearingFee,
  floatYield,
  savingsShare,
  clampScore,
  autonomousSpendLimit,
  riskAdjustedPremiumBps,
  buyerClearingFeeShare,
  verifyLocal,
  type VerificationRule,
  type Verdict,
} from "./lib/clearing";

const cfg = MANCA_CONFIG;

export class ClearingError extends Error {}

// ---- network singleton (holds the insurance pool) ----
export async function getInsurancePool(ctx: QueryCtx): Promise<number> {
  const net = await ctx.db.query("network").withIndex("by_key", (q) => q.eq("key", "prime")).unique();
  return net?.insurancePool ?? cfg.insurance.poolFloor;
}
async function networkDoc(ctx: MutationCtx): Promise<Doc<"network">> {
  const existing = await ctx.db.query("network").withIndex("by_key", (q) => q.eq("key", "prime")).unique();
  if (existing) return existing;
  const id = await ctx.db.insert("network", { key: "prime", insurancePool: cfg.insurance.poolFloor });
  return (await ctx.db.get(id))!;
}
async function addToPool(ctx: MutationCtx, delta: number): Promise<void> {
  const net = await networkDoc(ctx);
  await ctx.db.patch(net._id, { insurancePool: round(net.insurancePool + delta) });
}

async function recordRevenue(
  ctx: MutationCtx,
  reason: Doc<"revenue">["reason"],
  amount: number,
  note: string,
  tradeId?: Id<"trades">,
  accountId?: Id<"accounts">,
): Promise<void> {
  await ctx.db.insert("revenue", { reason, amount: round(amount), note, tradeId, accountId, at: Date.now() });
}

// ---- account helpers ----
async function ownedAccount(ctx: QueryCtx, userId: Id<"users">, accountId: Id<"accounts">): Promise<Doc<"accounts">> {
  const a = await ctx.db.get(accountId);
  if (!a) throw new ClearingError(`unknown account ${accountId}`);
  if (a.userId !== userId) throw new ClearingError("account belongs to another user");
  return a;
}

export function accountView(a: Doc<"accounts">) {
  return {
    id: a._id,
    label: a.label,
    handle: a.handle,
    balance: round(a.balance),
    escrowLocked: round(a.escrowLocked),
    reputation: a.reputation,
    successfulTrades: a.successfulTrades,
    failedTrades: a.failedTrades,
    verifiedSupplier: a.verifiedSupplier,
    payoutAddress: a.payoutAddress ?? null,
    autonomousSpendLimit: autonomousSpendLimit(a.reputation),
    createdAt: a._creationTime,
  };
}

// ---- operations ----
export async function register(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: { label: string; handle: string; publicKey?: string; payoutAddress?: string },
): Promise<Doc<"accounts">> {
  const existing = await ctx.db
    .query("accounts")
    .withIndex("by_user_handle", (q) => q.eq("userId", userId).eq("handle", args.handle))
    .unique();
  if (existing) return existing;
  const id = await ctx.db.insert("accounts", {
    userId,
    label: args.label,
    handle: args.handle,
    publicKey: args.publicKey,
    payoutAddress: args.payoutAddress,
    balance: 0,
    escrowLocked: 0,
    reputation: cfg.reputation.startScore,
    successfulTrades: 0,
    failedTrades: 0,
    verifiedSupplier: false,
  });
  return (await ctx.db.get(id))!;
}

export async function deposit(
  ctx: MutationCtx,
  userId: Id<"users">,
  accountId: Id<"accounts">,
  amount: number,
): Promise<Doc<"accounts">> {
  if (amount <= 0) throw new ClearingError("deposit must be positive");
  const a = await ownedAccount(ctx, userId, accountId);
  await ctx.db.patch(a._id, { balance: round(a.balance + amount) });
  return (await ctx.db.get(a._id))!;
}

export async function becomeSupplier(
  ctx: MutationCtx,
  userId: Id<"users">,
  accountId: Id<"accounts">,
): Promise<Doc<"accounts">> {
  const a = await ownedAccount(ctx, userId, accountId);
  if (!a.verifiedSupplier) {
    await ctx.db.patch(a._id, { verifiedSupplier: true });
    await recordRevenue(
      ctx,
      "verified_supply_subscription",
      cfg.verifiedSupply.subscriptionMonthlyUsd,
      "verified-supply subscription",
      undefined,
      a._id,
    );
  }
  return (await ctx.db.get(a._id))!;
}

export async function setPayoutAddress(
  ctx: MutationCtx,
  userId: Id<"users">,
  accountId: Id<"accounts">,
  payoutAddress: string,
): Promise<Doc<"accounts">> {
  const a = await ownedAccount(ctx, userId, accountId);
  await ctx.db.patch(a._id, { payoutAddress });
  return (await ctx.db.get(a._id))!;
}

export async function postOffer(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    sellerId: Id<"accounts">;
    category: string;
    attributes?: unknown;
    price: number;
    slaSeconds?: number;
    available?: number;
    title?: string;
    imageUrl?: string;
    floorPrice?: number;
    description?: string;
  },
): Promise<Doc<"offers">> {
  const seller = await ownedAccount(ctx, userId, args.sellerId);
  if (seller.reputation < cfg.risk.minReputationToSell)
    throw new ClearingError("seller reputation below minimum to sell");
  if (cfg.verifiedSupply.verificationRequired && !seller.verifiedSupplier)
    throw new ClearingError("seller must be a verified supplier to post offers");
  // A floor above list is meaningless; clamp it out.
  const floorPrice = args.floorPrice !== undefined && args.floorPrice < args.price ? args.floorPrice : undefined;
  const id = await ctx.db.insert("offers", {
    sellerId: seller._id,
    category: args.category,
    attributes: args.attributes ?? {},
    price: args.price,
    slaSeconds: args.slaSeconds ?? 60,
    available: args.available ?? 1,
    active: true,
    title: args.title,
    imageUrl: args.imageUrl,
    floorPrice,
    description: args.description,
  });
  return (await ctx.db.get(id))!;
}

export async function postMandate(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    buyerId: Id<"accounts">;
    category: string;
    spec?: unknown;
    maxPrice: number;
    minReputation?: number;
    referencePrice?: number;
    insured?: boolean;
    verification: VerificationRule;
    deadline: number;
  },
): Promise<Doc<"mandates">> {
  const buyer = await ownedAccount(ctx, userId, args.buyerId);
  if (args.maxPrice < cfg.clearing.minTradeValue)
    throw new ClearingError("maxPrice below network minimum trade value");
  const id = await ctx.db.insert("mandates", {
    buyerId: buyer._id,
    category: args.category,
    spec: args.spec ?? {},
    maxPrice: args.maxPrice,
    minReputation: args.minReputation ?? 0,
    referencePrice: args.referencePrice,
    insured: args.insured ?? false,
    verification: args.verification,
    deadline: args.deadline,
    status: "open",
  });
  return (await ctx.db.get(id))!;
}

// Best offer = cheapest that meets category, price ceiling, and reputation
// floor — reputation-weighted so a slightly pricier trusted seller can win.
async function findMatch(ctx: MutationCtx, m: Doc<"mandates">): Promise<Doc<"offers"> | null> {
  const offers = await ctx.db
    .query("offers")
    .withIndex("by_category_active", (q) => q.eq("category", m.category).eq("active", true))
    .collect();
  let best: Doc<"offers"> | null = null;
  let bestScore = Infinity;
  for (const o of offers) {
    if (o.available <= 0) continue;
    if (o.price > m.maxPrice) continue;
    const seller = await ctx.db.get(o.sellerId);
    if (!seller || seller.reputation < m.minReputation) continue;
    const repFactor = 1 + (cfg.reputation.maxScore - seller.reputation) / cfg.reputation.maxScore;
    const score = o.price * repFactor;
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

export async function match(
  ctx: MutationCtx,
  userId: Id<"users">,
  mandateId: Id<"mandates">,
): Promise<Doc<"trades">> {
  const m = await ctx.db.get(mandateId);
  if (!m) throw new ClearingError("unknown mandate");
  const buyer = await ctx.db.get(m.buyerId);
  if (!buyer) throw new ClearingError("unknown buyer");
  if (buyer.userId !== userId) throw new ClearingError("only the mandate owner can match it");
  if (m.status !== "open") throw new ClearingError(`mandate not open (${m.status})`);

  const offer = await findMatch(ctx, m);
  if (!offer) throw new ClearingError("no eligible offer matches this mandate");
  return lockTrade(ctx, m, offer, offer.price);
}

// Escrow-lock a trade for a given mandate + offer at a given price. Shared by
// list-price matching and negotiated trades. Atomic (one Convex transaction).
async function lockTrade(
  ctx: MutationCtx,
  m: Doc<"mandates">,
  offer: Doc<"offers">,
  price: number,
): Promise<Doc<"trades">> {
  const buyer = await ctx.db.get(m.buyerId);
  const seller = await ctx.db.get(offer.sellerId);
  if (!buyer || !seller) throw new ClearingError("missing counterparty");

  if (price > autonomousSpendLimit(buyer.reputation))
    throw new ClearingError(
      `price ${price} exceeds buyer autonomous spend limit ${autonomousSpendLimit(buyer.reputation)} — human approval required`,
    );

  const fee = clearingFee(price);
  const premiumBps = m.insured ? riskAdjustedPremiumBps(seller.reputation) : 0;
  const insurancePremium = m.insured ? round((price * premiumBps) / 10_000) : 0;
  const buyerFee = buyerClearingFeeShare(fee);
  const escrowLock = round(price + buyerFee);
  const totalDebit = round(escrowLock + insurancePremium);

  if (buyer.balance < totalDebit)
    throw new ClearingError(`insufficient balance: need ${totalDebit}, have ${round(buyer.balance)}`);

  await ctx.db.patch(buyer._id, {
    balance: round(buyer.balance - totalDebit),
    escrowLocked: round(buyer.escrowLocked + escrowLock),
  });
  await addToPool(ctx, insurancePremium);

  const nextAvail = offer.available - 1;
  await ctx.db.patch(offer._id, { available: nextAvail, active: nextAvail > 0 });
  await ctx.db.patch(m._id, { status: "matched" });

  const tradeId = await ctx.db.insert("trades", {
    mandateId: m._id,
    offerId: offer._id,
    buyerId: buyer._id,
    sellerId: seller._id,
    price,
    clearingFee: fee,
    insurancePremium,
    insured: m.insured,
    referencePrice: m.referencePrice,
    lockedAt: Date.now(),
    status: "matched",
    verification: m.verification,
    deadline: m.deadline,
    fulfillmentAttempts: 0,
  });
  return (await ctx.db.get(tradeId))!;
}

// After two agents agree on a price, create the mandate and lock the trade
// against that specific offer at the negotiated price.
export async function executeNegotiatedTrade(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    buyerId: Id<"accounts">;
    offerId: Id<"offers">;
    agreedPrice: number;
    verification: VerificationRule;
    insured?: boolean;
    referencePrice?: number;
    deadline: number;
  },
): Promise<Doc<"trades">> {
  const buyer = await ownedAccount(ctx, userId, args.buyerId);
  const offer = await ctx.db.get(args.offerId);
  if (!offer || !offer.active || offer.available <= 0) throw new ClearingError("offer no longer available");
  const mandateId = await ctx.db.insert("mandates", {
    buyerId: buyer._id,
    category: offer.category,
    spec: {},
    maxPrice: args.agreedPrice,
    minReputation: 0,
    referencePrice: args.referencePrice ?? offer.price, // list price is the reference we beat
    insured: args.insured ?? false,
    verification: args.verification,
    deadline: args.deadline,
    status: "open",
  });
  const mandate = (await ctx.db.get(mandateId))!;
  return lockTrade(ctx, mandate, offer, args.agreedPrice);
}

// Settle a matched trade. At launch the rail is "mock": funds move in-ledger
// atomically with a synthetic tx hash. testnet/mainnet routes through the x402
// Node action, which calls settleConfirmed() once the chain confirms.
export async function settle(
  ctx: MutationCtx,
  trade: Doc<"trades">,
  settlement?: { rail: string; mode: string; txHash: string | null },
): Promise<void> {
  const buyer = (await ctx.db.get(trade.buyerId))!;
  const seller = (await ctx.db.get(trade.sellerId))!;

  const buyerFee = buyerClearingFeeShare(trade.clearingFee);
  const sellerFee = round(trade.clearingFee - buyerFee);
  const escrowLock = round(trade.price + buyerFee);
  const sellerProceeds = round(trade.price - sellerFee);

  const rail = settlement ?? {
    rail: "mock",
    mode: "mock",
    txHash: `mock_${trade._id}`,
  };

  await ctx.db.patch(buyer._id, { escrowLocked: round(buyer.escrowLocked - escrowLock) });
  await ctx.db.patch(seller._id, { balance: round(seller.balance + sellerProceeds) });

  const heldMs = Date.now() - trade.lockedAt;
  await recordRevenue(ctx, "clearing_fee", trade.clearingFee, "cleared + guaranteed", trade._id);
  const fy = floatYield(escrowLock, heldMs);
  if (fy > 0) await recordRevenue(ctx, "float_yield", fy, `float on ${escrowLock} for ${heldMs}ms`, trade._id);
  const ss = savingsShare(trade.referencePrice, trade.price);
  if (ss > 0) await recordRevenue(ctx, "savings_share", ss, "share of realized savings", trade._id);
  if (trade.insured && trade.insurancePremium > 0) {
    await addToPool(ctx, -trade.insurancePremium);
    await recordRevenue(ctx, "insurance_premium", trade.insurancePremium, "insured trade settled — premium earned", trade._id);
  }

  await applyOutcome(ctx, seller._id, true);
  await applyOutcome(ctx, buyer._id, true);

  await ctx.db.patch(trade._id, {
    status: "settled",
    settledAt: Date.now(),
    settlementRail: rail.rail,
    settlementMode: rail.mode,
    settlementTx: rail.txHash,
  });
  await ctx.db.patch(trade.mandateId, { status: "settled" });
}

async function applyOutcome(ctx: MutationCtx, accountId: Id<"accounts">, success: boolean): Promise<void> {
  const a = (await ctx.db.get(accountId))!;
  if (success) {
    await ctx.db.patch(a._id, {
      reputation: clampScore(a.reputation + cfg.reputation.successDelta),
      successfulTrades: a.successfulTrades + 1,
    });
  } else {
    await ctx.db.patch(a._id, {
      reputation: clampScore(a.reputation - cfg.reputation.failureDelta),
      failedTrades: a.failedTrades + 1,
    });
  }
}

// Deliver against a trade. Locally-adjudicable rules settle atomically here.
// http_ok returns { deferred: true } so the caller runs the network probe in an
// action; manual never auto-settles.
export async function fulfill(
  ctx: MutationCtx,
  userId: Id<"users">,
  tradeId: Id<"trades">,
  payload: unknown,
): Promise<{ trade: Doc<"trades">; verdict: Verdict }> {
  const trade = await ctx.db.get(tradeId);
  if (!trade) throw new ClearingError("unknown trade");
  const seller = await ctx.db.get(trade.sellerId);
  if (!seller) throw new ClearingError("unknown seller");
  if (seller.userId !== userId) throw new ClearingError("only the trade's seller can fulfill it");
  if (trade.status !== "matched") throw new ClearingError(`trade not open (${trade.status})`);

  await ctx.db.patch(trade._id, { fulfillmentAttempts: trade.fulfillmentAttempts + 1 });

  const verdict = verifyLocal(trade.verification as VerificationRule, payload);
  if (verdict.deferred) return { trade: (await ctx.db.get(trade._id))!, verdict };
  if (!verdict.verified) return { trade: (await ctx.db.get(trade._id))!, verdict };

  await settle(ctx, (await ctx.db.get(trade._id))!);
  return { trade: (await ctx.db.get(trade._id))!, verdict };
}

// Expire overdue matched trades: refund buyer escrow, pay insurance from the
// pool if covered, penalize the seller. Also mark stale open mandates expired.
export async function expire(ctx: MutationCtx, now: number = Date.now()): Promise<number> {
  let failed = 0;
  const open = await ctx.db.query("trades").withIndex("by_status", (q) => q.eq("status", "matched")).collect();
  for (const trade of open) {
    if (now < trade.deadline) continue;
    const buyer = (await ctx.db.get(trade.buyerId))!;
    const buyerFee = buyerClearingFeeShare(trade.clearingFee);
    const escrowLock = round(trade.price + buyerFee);

    let newBalance = round(buyer.balance + escrowLock);
    await ctx.db.patch(buyer._id, { escrowLocked: round(buyer.escrowLocked - escrowLock) });

    if (trade.insured) {
      const coverage = round(trade.price * cfg.insurance.maxCoverageMultiple);
      const pool = await getInsurancePool(ctx);
      const payout = Math.min(coverage, pool);
      if (payout > 0) {
        await addToPool(ctx, -payout);
        newBalance = round(newBalance + payout);
        await recordRevenue(ctx, "insurance_premium", -payout, "insurance payout on failure", trade._id);
      }
    }
    await ctx.db.patch(buyer._id, { balance: newBalance });

    await applyOutcome(ctx, trade.sellerId, false);
    await ctx.db.patch(trade._id, { status: "failed", failReason: "fulfillment deadline missed" });
    await ctx.db.patch(trade.mandateId, { status: "failed" });
    failed += 1;
  }
  const openMandates = await ctx.db.query("mandates").withIndex("by_status", (q) => q.eq("status", "open")).collect();
  for (const m of openMandates) {
    if (now >= m.deadline) await ctx.db.patch(m._id, { status: "expired" });
  }
  return failed;
}

// ---- reporting ----
export async function revenueReport(ctx: QueryCtx) {
  const entries = await ctx.db.query("revenue").collect();
  const breakdown: Record<string, number> = {};
  let total = 0;
  for (const r of entries) {
    breakdown[r.reason] = round((breakdown[r.reason] ?? 0) + r.amount);
    total += r.amount;
  }
  const trades = await ctx.db.query("trades").collect();
  return {
    networkId: cfg.network.id,
    total: round(total),
    breakdown,
    insurancePool: round(await getInsurancePool(ctx)),
    trades: trades.length,
    settled: trades.filter((t) => t.status === "settled").length,
    failed: trades.filter((t) => t.status === "failed").length,
  };
}
