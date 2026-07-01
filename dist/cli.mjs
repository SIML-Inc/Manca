#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/core/crypto.ts
import {
  createHash,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  createPublicKey,
  createPrivateKey,
  randomBytes
} from "node:crypto";
function newKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url")
  };
}
function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}
function id(prefix) {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}
function canonical(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonical).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}
function signPayload(privateKeyB64u, payload) {
  const key = createPrivateKey({
    key: Buffer.from(privateKeyB64u, "base64url"),
    format: "der",
    type: "pkcs8"
  });
  return edSign(null, Buffer.from(canonical(payload)), key).toString("base64url");
}
function verifyPayload(publicKeyB64u, payload, signatureB64u) {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyB64u, "base64url"),
      format: "der",
      type: "spki"
    });
    return edVerify(
      null,
      Buffer.from(canonical(payload)),
      key,
      Buffer.from(signatureB64u, "base64url")
    );
  } catch {
    return false;
  }
}
var init_crypto = __esm({
  "src/core/crypto.ts"() {
    "use strict";
  }
});

// src/core/config.ts
var config_exports = {};
__export(config_exports, {
  configPath: () => configPath,
  loadConfig: () => loadConfig
});
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
function findConfig(start) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    const p = join(dir, "manca.config.json");
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
function resolvePath() {
  const here = dirname(fileURLToPath(import.meta.url));
  const found = findConfig(here) ?? findConfig(process.cwd());
  if (!found) throw new Error("manca.config.json not found (looked up from module and cwd)");
  return found;
}
function loadConfig(path) {
  return JSON.parse(readFileSync(path ?? resolvePath(), "utf8"));
}
function configPath() {
  return resolvePath();
}
var init_config = __esm({
  "src/core/config.ts"() {
    "use strict";
  }
});

// src/core/store.ts
import { readFileSync as readFileSync2, writeFileSync, existsSync as existsSync2, mkdirSync } from "node:fs";
import { dirname as dirname2 } from "node:path";
var Store;
var init_store = __esm({
  "src/core/store.ts"() {
    "use strict";
    Store = class {
      accounts = /* @__PURE__ */ new Map();
      mandates = /* @__PURE__ */ new Map();
      offers = /* @__PURE__ */ new Map();
      trades = /* @__PURE__ */ new Map();
      revenue = [];
      path;
      constructor(path = null) {
        this.path = path;
        if (path && existsSync2(path)) this.load();
      }
      load() {
        if (!this.path) return;
        const snap = JSON.parse(readFileSync2(this.path, "utf8"));
        for (const a of snap.accounts) this.accounts.set(a.id, a);
        for (const m of snap.mandates) this.mandates.set(m.id, m);
        for (const o of snap.offers) this.offers.set(o.id, o);
        for (const t of snap.trades) this.trades.set(t.id, t);
        this.revenue = snap.revenue ?? [];
      }
      persist() {
        if (!this.path) return;
        mkdirSync(dirname2(this.path), { recursive: true });
        const snap = {
          accounts: [...this.accounts.values()],
          mandates: [...this.mandates.values()],
          offers: [...this.offers.values()],
          trades: [...this.trades.values()],
          revenue: this.revenue
        };
        writeFileSync(this.path, JSON.stringify(snap, null, 2));
      }
    };
  }
});

// src/core/revenue.ts
var YEAR_MS, RevenueEngine;
var init_revenue = __esm({
  "src/core/revenue.ts"() {
    "use strict";
    init_crypto();
    YEAR_MS = 365 * 24 * 60 * 60 * 1e3;
    RevenueEngine = class {
      store;
      cfg;
      constructor(store, cfg) {
        this.store = store;
        this.cfg = cfg;
      }
      record(reason, amount, note, tradeId, accountId) {
        const entry = {
          id: id("rev"),
          reason,
          amount: Math.round(amount * 1e6) / 1e6,
          tradeId,
          accountId,
          at: Date.now(),
          note
        };
        this.store.revenue.push(entry);
        return entry;
      }
      clearingFee(value) {
        return value * this.cfg.clearing.clearingFeeBps / 1e4;
      }
      // Float yield earned while funds sat in escrow. Manca (or its reserve pool)
      // earns the time-value of money in flight — the Adyen/Circle mechanic.
      floatYield(principal, heldMs) {
        const apy = this.cfg.float.floatApyBps / 1e4;
        return principal * apy * (heldMs / YEAR_MS);
      }
      // Share of realized savings vs the buyer's reference price. Aligned: we only
      // earn when we make the buyer measurably better off.
      savingsShare(referencePrice, clearedPrice) {
        if (!this.cfg.savingsShare.enabled || referencePrice === void 0) return 0;
        const saved = referencePrice - clearedPrice;
        if (saved <= 0) return 0;
        return saved * this.cfg.savingsShare.savingsShareBps / 1e4;
      }
      total() {
        return this.store.revenue.reduce((s, r) => s + r.amount, 0);
      }
      breakdown() {
        const out = {};
        for (const r of this.store.revenue) out[r.reason] = (out[r.reason] ?? 0) + r.amount;
        for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 1e6) / 1e6;
        return out;
      }
    };
  }
});

// src/core/fulfillment.ts
async function verifyFulfillment(rule, payload, httpProbe = defaultHttpProbe) {
  switch (rule.type) {
    case "json_schema": {
      if (payload === null || typeof payload !== "object")
        return { verified: false, reason: "payload is not an object", machineAdjudicable: true };
      const obj = payload;
      for (const [k, want] of Object.entries(rule.requires)) {
        if (!(k in obj))
          return { verified: false, reason: `missing key '${k}'`, machineAdjudicable: true };
        if (want !== null && JSON.stringify(obj[k]) !== JSON.stringify(want))
          return { verified: false, reason: `key '${k}' mismatch`, machineAdjudicable: true };
      }
      return { verified: true, reason: "schema satisfied", machineAdjudicable: true };
    }
    case "hash_match": {
      const val = typeof payload === "string" ? payload : JSON.stringify(payload);
      const ok = sha256(val) === rule.sha256;
      return {
        verified: ok,
        reason: ok ? "hash matched" : "hash mismatch",
        machineAdjudicable: true
      };
    }
    case "value_threshold": {
      const obj = payload ?? {};
      const v = obj[rule.field];
      const ok = typeof v === "number" && v >= rule.min;
      return {
        verified: ok,
        reason: ok ? `${rule.field} >= ${rule.min}` : `${rule.field} below ${rule.min}`,
        machineAdjudicable: true
      };
    }
    case "http_ok": {
      const status = await httpProbe(rule.url);
      const want = rule.expectStatus ?? 200;
      const ok = status === want;
      return {
        verified: ok,
        reason: ok ? `http ${status}` : `http ${status} != ${want}`,
        machineAdjudicable: true
      };
    }
    case "manual":
      return {
        verified: false,
        reason: "manual verification required",
        machineAdjudicable: false
      };
  }
}
var defaultHttpProbe;
var init_fulfillment = __esm({
  "src/core/fulfillment.ts"() {
    "use strict";
    init_crypto();
    defaultHttpProbe = async (url) => {
      try {
        const res = await fetch(url, { method: "HEAD" });
        return res.status;
      } catch {
        return 0;
      }
    };
  }
});

// src/core/reputation.ts
function clampScore(cfg, score) {
  return Math.max(cfg.reputation.minScore, Math.min(cfg.reputation.maxScore, score));
}
function applyOutcome(cfg, acc, success) {
  if (success) {
    acc.reputation = clampScore(cfg, acc.reputation + cfg.reputation.successDelta);
    acc.successfulTrades += 1;
  } else {
    acc.reputation = clampScore(cfg, acc.reputation - cfg.reputation.failureDelta);
    acc.failedTrades += 1;
  }
}
function autonomousSpendLimit(cfg, acc) {
  const frac = acc.reputation / cfg.reputation.maxScore;
  return Math.round(frac * cfg.reputation.maxSpendCeilingUsd * 100) / 100;
}
function riskAdjustedPremiumBps(cfg, sellerRep) {
  const pivot = cfg.risk.premiumReputationPivot;
  const base = cfg.insurance.premiumBps;
  if (sellerRep >= pivot) return base;
  const risk = 1 + 2 * (pivot - sellerRep) / pivot;
  return Math.round(base * risk);
}
var init_reputation = __esm({
  "src/core/reputation.ts"() {
    "use strict";
  }
});

// src/rails/x402.ts
var x402_exports = {};
__export(x402_exports, {
  X402Rail: () => X402Rail
});
import { createHash as createHash2, randomBytes as randomBytes2 } from "node:crypto";
var X402Rail;
var init_x402 = __esm({
  "src/rails/x402.ts"() {
    "use strict";
    X402Rail = class {
      name = "x402";
      cfg;
      constructor(cfg) {
        this.cfg = cfg;
      }
      status() {
        return {
          rail: "x402",
          mode: this.cfg.mode,
          network: this.cfg.network,
          facilitator: this.cfg.facilitator,
          asset: this.cfg.asset,
          mainnetAllowed: this.cfg.allowMainnet === true || process.env.X402_ALLOW_MAINNET === "1",
          real: this.cfg.mode !== "mock"
        };
      }
      atomic(amount) {
        return BigInt(Math.round(amount * 10 ** this.cfg.usdcDecimals)).toString();
      }
      async settle(req) {
        if (this.cfg.mode === "mock") {
          const h = createHash2("sha256").update(`${req.ref}:${req.to}:${this.atomic(req.amount)}`).digest("hex");
          return { rail: "x402", mode: "mock", network: this.cfg.network, txHash: `0x${h.slice(0, 64)}`, success: true, note: "mock settlement \u2014 no on-chain movement" };
        }
        if (this.cfg.mode === "mainnet") {
          const allowed = this.cfg.allowMainnet === true || process.env.X402_ALLOW_MAINNET === "1";
          if (!allowed) throw new Error("x402 mainnet is disabled. Set settlement.x402.allowMainnet=true or X402_ALLOW_MAINNET=1 to move REAL money.");
        }
        const pk = process.env.X402_PRIVATE_KEY;
        if (!pk) throw new Error("x402 real settlement needs X402_PRIVATE_KEY (the Manca escrow wallet).");
        if (!/^0x[0-9a-fA-F]{40}$/.test(req.to)) throw new Error(`x402 real settlement needs an EVM payout address for the payee, got '${req.to}'`);
        let signTypedData, privateKeyToAccount;
        try {
          ({ privateKeyToAccount } = await import("viem/accounts"));
        } catch {
          throw new Error("real x402 settlement needs viem. Run: npm i viem");
        }
        const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
        const chainId = Number(this.cfg.network.split(":")[1]);
        const now = Math.floor(Date.now() / 1e3);
        const authorization = {
          from: account.address,
          to: req.to,
          value: this.atomic(req.amount),
          validAfter: "0",
          validBefore: String(now + this.cfg.maxTimeoutSeconds),
          nonce: `0x${randomBytes2(32).toString("hex")}`
        };
        const signature = await account.signTypedData({
          domain: { name: this.cfg.usdcName, version: this.cfg.usdcVersion, chainId, verifyingContract: this.cfg.asset },
          types: {
            TransferWithAuthorization: [
              { name: "from", type: "address" },
              { name: "to", type: "address" },
              { name: "value", type: "uint256" },
              { name: "validAfter", type: "uint256" },
              { name: "validBefore", type: "uint256" },
              { name: "nonce", type: "bytes32" }
            ]
          },
          primaryType: "TransferWithAuthorization",
          message: {
            from: authorization.from,
            to: authorization.to,
            value: BigInt(authorization.value),
            validAfter: BigInt(authorization.validAfter),
            validBefore: BigInt(authorization.validBefore),
            nonce: authorization.nonce
          }
        });
        const requirements = {
          scheme: "exact",
          network: this.cfg.network,
          maxAmountRequired: authorization.value,
          resource: `manca:${req.ref}`,
          description: `Manca settlement ${req.ref}`,
          mimeType: "application/json",
          payTo: req.to,
          maxTimeoutSeconds: this.cfg.maxTimeoutSeconds,
          asset: this.cfg.asset,
          extra: { assetTransferMethod: "eip3009", name: this.cfg.usdcName, version: this.cfg.usdcVersion }
        };
        const paymentPayload = { x402Version: 1, scheme: "exact", network: this.cfg.network, payload: { signature, authorization } };
        const post = async (path) => {
          const r = await fetch(`${this.cfg.facilitator}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ paymentPayload, paymentRequirements: requirements })
          });
          if (!r.ok) throw new Error(`x402 facilitator ${path} -> HTTP ${r.status}: ${await r.text()}`);
          return r.json();
        };
        const verify = await post("/verify");
        if (!verify.isValid) throw new Error(`x402 verify failed: ${verify.invalidReason ?? "unknown"}`);
        const settled = await post("/settle");
        if (!settled.success) throw new Error(`x402 settle failed: ${settled.errorReason ?? "unknown"}`);
        return { rail: "x402", mode: this.cfg.mode, network: settled.network, txHash: settled.transaction, success: true };
      }
    };
  }
});

// src/rails/settlement.ts
var settlement_exports = {};
__export(settlement_exports, {
  InternalRail: () => InternalRail,
  buildRail: () => buildRail
});
async function buildRail(cfg) {
  const s = cfg.settlement;
  if (!s || s.rail === "internal") return new InternalRail();
  if (s.rail === "x402") {
    const { X402Rail: X402Rail2 } = await Promise.resolve().then(() => (init_x402(), x402_exports));
    return new X402Rail2(s.x402);
  }
  return new InternalRail();
}
var InternalRail;
var init_settlement = __esm({
  "src/rails/settlement.ts"() {
    "use strict";
    InternalRail = class {
      name = "internal";
      async settle(_req) {
        return { rail: "internal", mode: "ledger", network: "internal", txHash: null, success: true };
      }
      status() {
        return { rail: "internal", mode: "ledger", note: "value moves inside the Manca ledger only" };
      }
    };
  }
});

// src/core/clearinghouse.ts
function canonicalMandate(i) {
  return {
    buyerId: i.buyerId,
    category: i.category,
    spec: i.spec,
    maxPrice: i.maxPrice,
    minReputation: i.minReputation,
    referencePrice: i.referencePrice ?? null,
    insured: i.insured,
    verification: i.verification,
    deadline: i.deadline
  };
}
function canonicalOffer(i) {
  return {
    sellerId: i.sellerId,
    category: i.category,
    attributes: i.attributes,
    price: i.price,
    slaSeconds: i.slaSeconds,
    available: i.available
  };
}
function round(n) {
  return Math.round(n * 1e6) / 1e6;
}
var MancaError, Clearinghouse;
var init_clearinghouse = __esm({
  "src/core/clearinghouse.ts"() {
    "use strict";
    init_crypto();
    init_store();
    init_revenue();
    init_fulfillment();
    init_reputation();
    init_settlement();
    MancaError = class extends Error {
    };
    Clearinghouse = class {
      store;
      cfg;
      revenue;
      insurancePool;
      rail;
      httpProbe;
      constructor(store, cfg, httpProbe, rail) {
        this.store = store;
        this.cfg = cfg;
        this.revenue = new RevenueEngine(store, cfg);
        this.httpProbe = httpProbe;
        this.insurancePool = cfg.insurance.poolFloor;
        this.rail = rail ?? new InternalRail();
      }
      // Load the settlement rail declared in config (e.g. x402). Call once after
      // construction when you want real (or mock-x402) settlement.
      async useConfiguredRail() {
        this.rail = await buildRail(this.cfg);
        return this;
      }
      acc(id2) {
        const a = this.store.accounts.get(id2);
        if (!a) throw new MancaError(`unknown account ${id2}`);
        return a;
      }
      register(label, publicKey) {
        const acc = {
          id: id("acct"),
          label,
          publicKey,
          balance: 0,
          escrowLocked: 0,
          reputation: this.cfg.reputation.startScore,
          successfulTrades: 0,
          failedTrades: 0,
          verifiedSupplier: false,
          createdAt: Date.now()
        };
        this.store.accounts.set(acc.id, acc);
        return acc;
      }
      deposit(accountId, amount) {
        if (amount <= 0) throw new MancaError("deposit must be positive");
        const a = this.acc(accountId);
        a.balance = round(a.balance + amount);
        return a;
      }
      // A seller opts into verified supply (better discovery + eligibility). Booked
      // as recurring subscription revenue — real money independent of any trade.
      enableVerifiedSupplier(accountId) {
        const a = this.acc(accountId);
        if (!a.verifiedSupplier) {
          a.verifiedSupplier = true;
          this.revenue.record(
            "verified_supply_subscription",
            this.cfg.verifiedSupply.subscriptionMonthlyUsd,
            "verified-supply subscription",
            void 0,
            a.id
          );
        }
        return a;
      }
      postBuyMandate(input, signature) {
        const buyer = this.acc(input.buyerId);
        if (!verifyPayload(buyer.publicKey, canonicalMandate(input), signature))
          throw new MancaError("invalid buyer signature on mandate");
        if (input.maxPrice < this.cfg.clearing.minTradeValue)
          throw new MancaError("maxPrice below network minimum trade value");
        const m = {
          id: id("mnd"),
          ...input,
          signature,
          createdAt: Date.now(),
          status: "open"
        };
        this.store.mandates.set(m.id, m);
        return m;
      }
      postSellOffer(input, signature) {
        const seller = this.acc(input.sellerId);
        if (!verifyPayload(seller.publicKey, canonicalOffer(input), signature))
          throw new MancaError("invalid seller signature on offer");
        if (seller.reputation < this.cfg.risk.minReputationToSell)
          throw new MancaError("seller reputation below minimum to sell");
        if (this.cfg.verifiedSupply.verificationRequired && !seller.verifiedSupplier)
          throw new MancaError("seller must be a verified supplier to post offers");
        const o = {
          id: id("off"),
          ...input,
          signature,
          createdAt: Date.now(),
          active: true
        };
        this.store.offers.set(o.id, o);
        return o;
      }
      // Best offer = cheapest offer that meets spec, price ceiling, and reputation
      // floor — reputation-weighted so a slightly pricier trusted seller can win.
      findMatch(mandateId) {
        const m = this.store.mandates.get(mandateId);
        if (!m || m.status !== "open") return null;
        let best = null;
        let bestScore = Infinity;
        for (const o of this.store.offers.values()) {
          if (!o.active || o.available <= 0) continue;
          if (o.category !== m.category) continue;
          if (o.price > m.maxPrice) continue;
          const seller = this.store.accounts.get(o.sellerId);
          if (!seller || seller.reputation < m.minReputation) continue;
          const repFactor = 1 + (this.cfg.reputation.maxScore - seller.reputation) / this.cfg.reputation.maxScore;
          const score = o.price * repFactor;
          if (score < bestScore) {
            bestScore = score;
            best = o;
          }
        }
        return best;
      }
      match(mandateId) {
        const m = this.store.mandates.get(mandateId);
        if (!m) throw new MancaError("unknown mandate");
        if (m.status !== "open") throw new MancaError(`mandate not open (${m.status})`);
        const offer = this.findMatch(mandateId);
        if (!offer) throw new MancaError("no eligible offer matches this mandate");
        const buyer = this.acc(m.buyerId);
        const seller = this.acc(offer.sellerId);
        const price = offer.price;
        if (price > autonomousSpendLimit(this.cfg, buyer))
          throw new MancaError(
            `price ${price} exceeds buyer autonomous spend limit ${autonomousSpendLimit(this.cfg, buyer)} \u2014 human approval required`
          );
        const clearingFee = this.revenue.clearingFee(price);
        const premiumBps = m.insured ? riskAdjustedPremiumBps(this.cfg, seller.reputation) : 0;
        const insurancePremium = m.insured ? round(price * premiumBps / 1e4) : 0;
        const buyerClearingFee = this.cfg.clearing.clearingFeePayer === "seller" ? 0 : this.cfg.clearing.clearingFeePayer === "split" ? round(clearingFee / 2) : clearingFee;
        const escrowLock = round(price + buyerClearingFee);
        const totalDebit = round(escrowLock + insurancePremium);
        if (buyer.balance < totalDebit)
          throw new MancaError(
            `insufficient balance: need ${totalDebit}, have ${buyer.balance}`
          );
        buyer.balance = round(buyer.balance - totalDebit);
        buyer.escrowLocked = round(buyer.escrowLocked + escrowLock);
        this.insurancePool = round(this.insurancePool + insurancePremium);
        offer.available -= 1;
        if (offer.available <= 0) offer.active = false;
        m.status = "matched";
        const trade = {
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
          fulfillmentAttempts: 0
        };
        this.store.trades.set(trade.id, trade);
        return trade;
      }
      async submitFulfillment(tradeId, payload) {
        const trade = this.store.trades.get(tradeId);
        if (!trade) throw new MancaError("unknown trade");
        if (trade.status !== "matched") throw new MancaError(`trade not open (${trade.status})`);
        trade.fulfillmentAttempts += 1;
        const verdict = await verifyFulfillment(trade.verification, payload, this.httpProbe);
        if (!verdict.verified) return { trade, verdict };
        await this.settle(trade);
        return { trade, verdict };
      }
      async settle(trade) {
        const buyer = this.acc(trade.buyerId);
        const seller = this.acc(trade.sellerId);
        const buyerClearingFee = this.cfg.clearing.clearingFeePayer === "seller" ? 0 : this.cfg.clearing.clearingFeePayer === "split" ? round(trade.clearingFee / 2) : trade.clearingFee;
        const sellerClearingFee = round(trade.clearingFee - buyerClearingFee);
        const escrowLock = round(trade.price + buyerClearingFee);
        const sellerProceeds = round(trade.price - sellerClearingFee);
        const settlement = await this.rail.settle({
          from: this.cfg.network.id,
          to: seller.payoutAddress ?? seller.id,
          amount: sellerProceeds,
          ref: trade.id
        });
        trade.settlementRail = settlement.rail;
        trade.settlementMode = settlement.mode;
        trade.settlementTx = settlement.txHash;
        buyer.escrowLocked = round(buyer.escrowLocked - escrowLock);
        seller.balance = round(seller.balance + sellerProceeds);
        const heldMs = Date.now() - trade.lockedAt;
        this.revenue.record("clearing_fee", trade.clearingFee, "cleared + guaranteed", trade.id);
        const fy = this.revenue.floatYield(escrowLock, heldMs);
        if (fy > 0) this.revenue.record("float_yield", fy, `float on ${escrowLock} for ${heldMs}ms`, trade.id);
        const ss = this.revenue.savingsShare(trade.referencePrice, trade.price);
        if (ss > 0) this.revenue.record("savings_share", ss, "share of realized savings", trade.id);
        if (trade.insured && trade.insurancePremium > 0) {
          this.insurancePool = round(this.insurancePool - trade.insurancePremium);
          this.revenue.record("insurance_premium", trade.insurancePremium, "insured trade settled \u2014 premium earned", trade.id);
        }
        applyOutcome(this.cfg, seller, true);
        applyOutcome(this.cfg, buyer, true);
        trade.status = "settled";
        trade.settledAt = Date.now();
        const m = this.store.mandates.get(trade.mandateId);
        if (m) m.status = "settled";
      }
      // Expire overdue matched trades: refund the buyer from escrow, pay insurance
      // compensation if covered, and penalize the seller's reputation.
      expire(now = Date.now()) {
        let failed = 0;
        for (const trade of this.store.trades.values()) {
          if (trade.status !== "matched") continue;
          if (now < trade.deadline) continue;
          const buyer = this.acc(trade.buyerId);
          const seller = this.acc(trade.sellerId);
          const buyerClearingFee = this.cfg.clearing.clearingFeePayer === "seller" ? 0 : this.cfg.clearing.clearingFeePayer === "split" ? round(trade.clearingFee / 2) : trade.clearingFee;
          const escrowLock = round(trade.price + buyerClearingFee);
          buyer.escrowLocked = round(buyer.escrowLocked - escrowLock);
          buyer.balance = round(buyer.balance + escrowLock);
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
        for (const m of this.store.mandates.values()) {
          if (m.status === "open" && now >= m.deadline) m.status = "expired";
        }
        return failed;
      }
      accountView(accountId) {
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
          failed: [...this.store.trades.values()].filter((t) => t.status === "failed").length
        };
      }
    };
  }
});

// src/agent.ts
var Agent;
var init_agent = __esm({
  "src/agent.ts"() {
    "use strict";
    init_crypto();
    init_clearinghouse();
    Agent = class {
      hub;
      account;
      privateKey;
      constructor(hub, label) {
        const kp = newKeyPair();
        this.hub = hub;
        this.privateKey = kp.privateKey;
        this.account = hub.register(label, kp.publicKey);
      }
      get id() {
        return this.account.id;
      }
      deposit(amount) {
        this.hub.deposit(this.id, amount);
        return this;
      }
      becomeVerifiedSupplier() {
        this.hub.enableVerifiedSupplier(this.id);
        return this;
      }
      // --- buyer side ---
      buy(input) {
        const full = { ...input, buyerId: this.id };
        const sig = signPayload(this.privateKey, canonicalMandate(full));
        return this.hub.postBuyMandate(full, sig);
      }
      // --- seller side (same agent) ---
      sell(input) {
        const full = { ...input, sellerId: this.id };
        const sig = signPayload(this.privateKey, canonicalOffer(full));
        return this.hub.postSellOffer(full, sig);
      }
      fulfill(tradeId, payload) {
        return this.hub.submitFulfillment(tradeId, payload);
      }
      view() {
        return this.hub.accountView(this.id);
      }
    };
  }
});

// src/server/dashboard.ts
function dashboardHtml(name, networkId) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Manca \u2014 ${name}</title>
<style>
  :root{--bg:#0d1117;--fg:#e6edf3;--dim:#8b98a5;--line:#232b36;--accent:#58a6ff;--good:#3fb950;--warn:#f85149;--gold:#e3b341;--purp:#bc8cff}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  header{padding:20px 28px;border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
  h1{margin:0;font-size:22px;letter-spacing:.5px}
  .tag{color:var(--dim);font-size:12px;font-family:ui-monospace,Menlo,monospace}
  .live{margin-left:auto;color:var(--good);font-size:12px}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--good);margin-right:6px;animation:p 1.4s infinite}
  @keyframes p{0%,100%{opacity:1}50%{opacity:.3}}
  main{padding:24px 28px;max-width:1100px;margin:0 auto}
  .rev{display:flex;align-items:baseline;gap:16px;margin-bottom:8px}
  .rev .big{font-size:48px;font-weight:700;color:var(--good)}
  .rev .lbl{color:var(--dim);text-transform:uppercase;letter-spacing:1px;font-size:12px}
  .chips{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 28px}
  .chip{background:#131a23;border:1px solid var(--line);border-radius:9px;padding:10px 14px}
  .chip .k{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  .chip .v{font-size:18px;font-weight:600}
  h2{font-size:13px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin:26px 0 10px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--dim);font-weight:500;padding:8px 10px;border-bottom:1px solid var(--line)}
  td{padding:9px 10px;border-bottom:1px solid #171e27}
  .mono{font-family:ui-monospace,Menlo,monospace}
  .pill{padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
  .settled{background:rgba(63,185,80,.15);color:var(--good)}
  .failed{background:rgba(248,81,73,.15);color:var(--warn)}
  .matched{background:rgba(88,166,255,.15);color:var(--accent)}
  .bar{height:6px;border-radius:3px;background:#1b2530;overflow:hidden;min-width:80px}
  .bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--purp),var(--accent))}
  .g{color:var(--good)} .w{color:var(--warn)} .gold{color:var(--gold)}
  .controls{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 6px}
  button{cursor:pointer;border:1px solid var(--line);background:#131a23;color:var(--fg);padding:10px 16px;border-radius:9px;font-size:13px;font-weight:600;transition:.12s}
  button:hover{border-color:var(--accent);transform:translateY(-1px)}
  button.buy{border-color:rgba(88,166,255,.4)} button.ins{border-color:rgba(188,140,255,.4)} button.fail{border-color:rgba(248,81,73,.4)} button.burst{border-color:rgba(63,185,80,.4)}
  #flash{color:var(--dim);font-size:12px;align-self:center}
</style></head><body>
<header>
  <h1>Manca</h1><span class="tag">${name} \xB7 ${networkId}</span>
  <span class="tag" id="rail" style="color:var(--purp)"></span>
  <span class="live"><span class="dot"></span>live \xB7 updates every 2s</span>
</header>
<main>
  <div class="controls">
    <button class="buy" onclick="sim('settle')">\u25B8 Buy something</button>
    <button class="ins" onclick="sim('insured')">\u{1F6E1}\uFE0F Insured buy</button>
    <button class="fail" onclick="sim('fail')">\u2715 Simulate a failure</button>
    <button class="burst" onclick="burst()">\u26A1 Fire 5 trades</button>
    <span id="flash"></span>
  </div>
  <div class="rev"><div class="big" id="rev">$0.00</div><div class="lbl">total network revenue</div></div>
  <div class="chips" id="chips"></div>
  <h2>Revenue breakdown</h2><table id="breakdown"><tbody></tbody></table>
  <h2>Accounts \xB7 reputation graph (the moat)</h2><table id="accts"><thead><tr><th>agent</th><th>balance</th><th>escrow</th><th>reputation</th><th></th><th>ok/fail</th><th>autonomy</th></tr></thead><tbody></tbody></table>
  <h2>Trades</h2><table id="trades"><thead><tr><th>id</th><th>category</th><th>buyer \u2192 seller</th><th>price</th><th>insured</th><th>status</th><th>settlement (x402)</th></tr></thead><tbody></tbody></table>
</main>
<script>
const usd=n=>'$'+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4});
async function tick(){
  try{
    const s=await (await fetch('/state')).json();
    if(s.rail) document.getElementById('rail').textContent='rail: '+s.rail.rail+'/'+s.rail.mode+(s.rail.network&&s.rail.network!=='internal'?' \xB7 '+s.rail.network:'');
    document.getElementById('rev').textContent=usd(s.revenue.total);
    document.getElementById('chips').innerHTML=[
      ['settled',s.revenue.settled],['failed',s.revenue.failed],
      ['insurance pool',usd(s.revenue.insurancePool)],['accounts',s.accounts.length]
    ].map(([k,v])=>'<div class="chip"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>').join('');
    document.querySelector('#breakdown tbody').innerHTML=Object.entries(s.revenue.breakdown)
      .map(([k,v])=>'<tr><td>'+k.replace(/_/g,' ')+'</td><td class="mono '+(v>=0?'g':'w')+'">'+usd(v)+'</td></tr>').join('');
    document.querySelector('#accts tbody').innerHTML=s.accounts.map(a=>{
      const pct=Math.round(a.reputation/1000*100);
      return '<tr><td>'+a.label+'</td><td class="mono">'+usd(a.balance)+'</td><td class="mono">'+usd(a.escrowLocked)+'</td>'+
        '<td class="mono gold">'+a.reputation+'</td><td><div class="bar"><i style="width:'+pct+'%"></i></div></td>'+
        '<td class="mono"><span class="g">'+a.successfulTrades+'</span>/<span class="w">'+a.failedTrades+'</span></td>'+
        '<td class="mono">'+usd(a.autonomousSpendLimit)+'</td></tr>';
    }).join('');
    const explorer=(s.rail&&(s.rail.mode==='testnet'||s.rail.mode==='mainnet'))?(s.rail.mode==='mainnet'?'https://basescan.org/tx/':'https://sepolia.basescan.org/tx/'):null;
    const txcell=t=>{if(!t.tx)return '<span style="color:var(--dim)">\u2014</span>';const short=t.tx.slice(0,10)+'\u2026'+t.tx.slice(-6);return explorer?'<a class="mono" target="_blank" href="'+explorer+t.tx+'">'+short+'</a>':'<span class="mono" style="color:var(--purp)">'+short+'</span>';};
    document.querySelector('#trades tbody').innerHTML=s.trades.map(t=>
      '<tr><td class="mono">'+t.id+'</td><td>'+t.category+'</td><td>'+t.buyer+' \u2192 '+t.seller+'</td>'+
      '<td class="mono">'+usd(t.price)+'</td><td>'+(t.insured?'\u{1F6E1}\uFE0F':'')+'</td>'+
      '<td><span class="pill '+t.status+'">'+t.status+'</span></td><td>'+txcell(t)+'</td></tr>').join('')||'<tr><td colspan=7 style="color:var(--dim)">no trades yet \u2014 click a button above</td></tr>';
  }catch(e){}
}
async function sim(kind){
  const f=document.getElementById('flash');
  try{const r=await (await fetch('/simulate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind})})).json();
    f.textContent=r.category+' $'+r.price+' -> '+r.result;}catch(e){f.textContent='error';}
  tick();
}
async function burst(){ for(let i=0;i<5;i++){ await sim(i%3===2?'insured':(i===3?'fail':'settle')); await new Promise(r=>setTimeout(r,250)); } }
tick();setInterval(tick,2000);
</script></body></html>`;
}
var init_dashboard = __esm({
  "src/server/dashboard.ts"() {
    "use strict";
  }
});

// src/server/http.ts
var http_exports = {};
__export(http_exports, {
  startHttp: () => startHttp
});
import { createServer } from "node:http";
async function seed(hub) {
  const acme = new Agent(hub, "ACME procurement").deposit(5e3);
  const scrape = new Agent(hub, "ScrapeFarm").becomeVerifiedSupplier();
  const gpu = new Agent(hub, "NimbusGPU").becomeVerifiedSupplier();
  const flaky = new Agent(hub, "FlakyData").becomeVerifiedSupplier();
  scrape.sell({ category: "web-scrape", attributes: { rows: 5e3 }, price: 40, slaSeconds: 30, available: 5 });
  gpu.sell({ category: "compute", attributes: { gpu: "h100" }, price: 120, slaSeconds: 30, available: 3 });
  flaky.sell({ category: "data-enrichment", attributes: {}, price: 25, slaSeconds: 30, available: 2 });
  let m = acme.buy({ category: "web-scrape", spec: {}, maxPrice: 50, minReputation: 0, referencePrice: 60, insured: false, verification: { type: "value_threshold", field: "rows", min: 5e3 }, deadline: Date.now() + 6e4 });
  await scrape.fulfill(hub.match(m.id).id, { rows: 5200 });
  m = acme.buy({ category: "compute", spec: {}, maxPrice: 150, minReputation: 0, referencePrice: 140, insured: true, verification: { type: "json_schema", requires: { done: true } }, deadline: Date.now() + 6e4 });
  await gpu.fulfill(hub.match(m.id).id, { done: true });
  m = acme.buy({ category: "data-enrichment", spec: {}, maxPrice: 30, minReputation: 0, insured: true, verification: { type: "json_schema", requires: { delivered: true } }, deadline: Date.now() - 1 });
  hub.match(m.id);
  hub.expire(Date.now());
}
async function startHttp(port = 8787, dataPath = "data/manca.json") {
  const cfg = loadConfig();
  const store = new Store(dataPath);
  const hub = new Clearinghouse(store, cfg);
  await hub.useConfiguredRail();
  if (process.env.MANCA_SEED === "1" && store.accounts.size === 0) await seed(hub);
  const CATS = ["web-scrape", "compute", "data-enrichment", "llm-eval", "translation", "image-gen"];
  async function simulateTrade(kind) {
    const n = store.accounts.size;
    const cat = CATS[n % CATS.length];
    const price = 20 + n * 37 % 180;
    const buyer = new Agent(hub, `buyer-${n}`).deposit(price * 3);
    const seller = new Agent(hub, `seller-${n}`).becomeVerifiedSupplier();
    seller.sell({ category: cat, attributes: {}, price, slaSeconds: 60, available: 1 });
    const insured = kind === "insured";
    const fail = kind === "fail";
    const mandate = buyer.buy({
      category: cat,
      spec: {},
      maxPrice: price + 50,
      minReputation: 0,
      referencePrice: price + 40,
      insured,
      verification: { type: "json_schema", requires: { ok: true } },
      deadline: fail ? Date.now() - 1 : Date.now() + 6e4
    });
    if (fail) {
      hub.match(mandate.id);
      hub.expire();
      return { category: cat, price, result: "failed" };
    }
    const trade = hub.match(mandate.id);
    const r = await seller.fulfill(trade.id, { ok: true });
    return { category: cat, price, insured, result: r.verdict.verified ? "settled" : "rejected" };
  }
  const state = () => {
    const accounts = [...store.accounts.values()].map((a) => hub.accountView(a.id));
    const trades = [...store.trades.values()].map((t) => ({
      id: t.id,
      category: store.mandates.get(t.mandateId)?.category ?? "?",
      buyer: store.accounts.get(t.buyerId)?.label ?? t.buyerId,
      seller: store.accounts.get(t.sellerId)?.label ?? t.sellerId,
      price: t.price,
      insured: t.insured,
      status: t.status,
      tx: t.settlementTx ?? null
    }));
    return { network: cfg.network, rail: hub.rail.status(), revenue: hub.revenueReport(), accounts, trades };
  };
  const json = (res, code, body) => {
    const s = JSON.stringify(body, null, 2);
    res.writeHead(code, { "content-type": "application/json" });
    res.end(s);
  };
  const readBody = (req) => new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => b += c);
    req.on("end", () => resolve(b ? JSON.parse(b) : {}));
  });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      const parts = url.pathname.split("/").filter(Boolean);
      const m = req.method ?? "GET";
      if (m === "GET" && parts.length === 0) {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(dashboardHtml(cfg.network.name, cfg.network.id));
      }
      if (m === "GET" && parts[0] === "state") return json(res, 200, state());
      if (m === "GET" && parts[0] === "health")
        return json(res, 200, { ok: true, network: cfg.network.id, name: cfg.network.name });
      if (m === "GET" && parts[0] === "revenue")
        return json(res, 200, hub.revenueReport());
      if (m === "GET" && parts[0] === "accounts" && parts[1])
        return json(res, 200, hub.accountView(parts[1]));
      if (m === "POST") {
        const body = await readBody(req);
        if (parts[0] === "simulate")
          return json(res, 200, await simulateTrade(body.kind ?? "settle"));
        if (parts[0] === "accounts" && parts.length === 1)
          return json(res, 201, hub.register(body.label, body.publicKey));
        if (parts[0] === "accounts" && parts[2] === "deposit")
          return json(res, 200, hub.deposit(parts[1], body.amount));
        if (parts[0] === "accounts" && parts[2] === "verify")
          return json(res, 200, hub.enableVerifiedSupplier(parts[1]));
        if (parts[0] === "mandates")
          return json(res, 201, hub.postBuyMandate(body, body.signature));
        if (parts[0] === "offers")
          return json(res, 201, hub.postSellOffer(body, body.signature));
        if (parts[0] === "match")
          return json(res, 200, hub.match(body.mandateId));
        if (parts[0] === "fulfill")
          return json(res, 200, await hub.submitFulfillment(body.tradeId, body.payload));
        if (parts[0] === "expire")
          return json(res, 200, { failed: hub.expire() });
      }
      json(res, 404, { error: "not found" });
    } catch (e) {
      const code = e instanceof MancaError ? 400 : 500;
      json(res, code, { error: e.message });
    } finally {
      store.persist();
    }
  });
  server.listen(port, () => {
    console.log(`Manca HTTP API on http://localhost:${port}  (network ${cfg.network.id})`);
  });
  return server;
}
var init_http = __esm({
  "src/server/http.ts"() {
    "use strict";
    init_store();
    init_clearinghouse();
    init_config();
    init_agent();
    init_dashboard();
  }
});

// src/server/mcp.ts
var mcp_exports = {};
__export(mcp_exports, {
  startMcp: () => startMcp
});
import { createInterface } from "node:readline";
async function startMcp(dataPath = null) {
  const cfg = loadConfig();
  const store = new Store(dataPath);
  const hub = new Clearinghouse(store, cfg);
  await hub.useConfiguredRail();
  const agents = /* @__PURE__ */ new Map();
  const agentFor = (handle) => {
    let a = agents.get(handle);
    if (!a) {
      a = new Agent(hub, handle);
      agents.set(handle, a);
    }
    return a;
  };
  const tools = [
    { name: "manca_whoami", description: "Get this network's id, settlement asset, and fee schedule.", inputSchema: { type: "object", properties: {} } },
    { name: "manca_open_account", description: "Open (or fetch) your symmetric clearing account. Returns your agent handle, balance, reputation, and autonomous spend limit.", inputSchema: { type: "object", properties: { handle: { type: "string", description: "a stable name for your agent" } }, required: ["handle"] } },
    { name: "manca_deposit", description: "Add settlement balance to your account (demo/testnet credit).", inputSchema: { type: "object", properties: { handle: { type: "string" }, amount: { type: "number" } }, required: ["handle", "amount"] } },
    { name: "manca_become_supplier", description: "Enable verified-supplier status so you can post sell offers.", inputSchema: { type: "object", properties: { handle: { type: "string" } }, required: ["handle"] } },
    { name: "manca_sell", description: "Post a machine-committable sell offer.", inputSchema: { type: "object", properties: { handle: { type: "string" }, category: { type: "string" }, price: { type: "number" }, slaSeconds: { type: "number" }, available: { type: "number" }, attributes: { type: "object" } }, required: ["handle", "category", "price"] } },
    { name: "manca_buy", description: "Post a buy mandate. Manca matches, escrows funds, and settles automatically when the seller's delivery satisfies your verification rule.", inputSchema: { type: "object", properties: { handle: { type: "string" }, category: { type: "string" }, maxPrice: { type: "number" }, minReputation: { type: "number" }, referencePrice: { type: "number" }, insured: { type: "boolean" }, deadlineSeconds: { type: "number" }, verification: { type: "object", description: "e.g. {type:'value_threshold',field:'rows',min:1000} or {type:'json_schema',requires:{ok:true}}" }, spec: { type: "object" } }, required: ["handle", "category", "maxPrice", "verification"] } },
    { name: "manca_match", description: "Match a buy mandate to the best eligible sell offer and lock escrow. Returns the trade.", inputSchema: { type: "object", properties: { mandateId: { type: "string" } }, required: ["mandateId"] } },
    { name: "manca_fulfill", description: "Deliver against a trade; Manca machine-verifies and auto-settles if it passes.", inputSchema: { type: "object", properties: { handle: { type: "string" }, tradeId: { type: "string" }, payload: {} }, required: ["handle", "tradeId", "payload"] } },
    { name: "manca_account", description: "Fetch an account view by handle.", inputSchema: { type: "object", properties: { handle: { type: "string" } }, required: ["handle"] } },
    { name: "manca_revenue", description: "Network P&L: clearing fees, float, savings share, insurance, subscriptions.", inputSchema: { type: "object", properties: {} } }
  ];
  async function callTool(name, args) {
    switch (name) {
      case "manca_whoami":
        return { network: cfg.network, clearing: cfg.clearing, float: cfg.float, insurance: cfg.insurance, settlement: hub.rail.status() };
      case "manca_open_account":
        return agentFor(args.handle).view();
      case "manca_deposit":
        return agentFor(args.handle).deposit(args.amount).view();
      case "manca_become_supplier":
        return agentFor(args.handle).becomeVerifiedSupplier().view();
      case "manca_sell":
        return agentFor(args.handle).sell({
          category: args.category,
          attributes: args.attributes ?? {},
          price: args.price,
          slaSeconds: args.slaSeconds ?? 60,
          available: args.available ?? 1
        });
      case "manca_buy":
        return agentFor(args.handle).buy({
          category: args.category,
          spec: args.spec ?? {},
          maxPrice: args.maxPrice,
          minReputation: args.minReputation ?? 0,
          referencePrice: args.referencePrice,
          insured: args.insured ?? false,
          verification: args.verification,
          deadline: Date.now() + (args.deadlineSeconds ?? 3600) * 1e3
        });
      case "manca_match":
        return hub.match(args.mandateId);
      case "manca_fulfill":
        return await agentFor(args.handle).fulfill(args.tradeId, args.payload);
      case "manca_account":
        return agentFor(args.handle).view();
      case "manca_revenue":
        return hub.revenueReport();
      default:
        throw new Error(`unknown tool ${name}`);
    }
  }
  const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
  const rl = createInterface({ input: process.stdin });
  rl.on("line", async (line2) => {
    const text = line2.trim();
    if (!text) return;
    let req;
    try {
      req = JSON.parse(text);
    } catch {
      return;
    }
    const reply = (result) => send({ jsonrpc: "2.0", id: req.id, result });
    const fail = (message) => send({ jsonrpc: "2.0", id: req.id, error: { code: -32e3, message } });
    try {
      if (req.method === "initialize") {
        return reply({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "manca", version: "0.1.0" }
        });
      }
      if (req.method === "notifications/initialized" || req.method === "notifications/cancelled") return;
      if (req.method === "ping") return reply({});
      if (req.method === "tools/list") return reply({ tools });
      if (req.method === "tools/call") {
        const out = await callTool(req.params?.name, req.params?.arguments ?? {});
        return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      }
      if (req.id !== void 0 && req.id !== null) fail(`method not found: ${req.method}`);
    } catch (e) {
      if (req.method === "tools/call")
        return reply({ content: [{ type: "text", text: `error: ${e.message}` }], isError: true });
      fail(e.message);
    }
  });
  process.stderr.write(`Manca MCP server ready on stdio (network ${cfg.network.id})
`);
}
var PROTOCOL_VERSION;
var init_mcp = __esm({
  "src/server/mcp.ts"() {
    "use strict";
    init_store();
    init_clearinghouse();
    init_config();
    init_agent();
    PROTOCOL_VERSION = "2025-06-18";
  }
});

// src/demo.ts
var demo_exports = {};
function line(s = "") {
  console.log(s);
}
function head(s) {
  line(`
${B}${C}${s}${X}`);
}
async function main() {
  const cfg = loadConfig();
  const hub = new Clearinghouse(new Store(), cfg, async (u) => u.includes("healthy") ? 200 : 500);
  await hub.useConfiguredRail();
  line(`${B}Manca${X} ${D}// ${cfg.network.name} (${cfg.network.id})${X}`);
  line(`${D}The missing trust layer for agent-to-agent commerce.${X}`);
  line(`${D}settlement rail: ${JSON.stringify(hub.rail.status())}${X}`);
  const acme = new Agent(hub, "ACME procurement agent").deposit(5e3);
  const scrapers = new Agent(hub, "ScrapeFarm sell-agent").becomeVerifiedSupplier();
  const gpu = new Agent(hub, "NimbusGPU sell-agent").becomeVerifiedSupplier();
  const flaky = new Agent(hub, "FlakyData sell-agent").becomeVerifiedSupplier();
  head("1. Sellers post machine-committable offers");
  scrapers.sell({ category: "web-scrape", attributes: { rows: 5e3 }, price: 40, slaSeconds: 30, available: 5 });
  gpu.sell({ category: "compute", attributes: { gpu: "h100", hours: 1 }, price: 120, slaSeconds: 30, available: 3 });
  flaky.sell({ category: "data-enrichment", attributes: { records: 1e3 }, price: 25, slaSeconds: 30, available: 2 });
  line(`${D}ScrapeFarm: web-scrape @ ${usd(40)} | NimbusGPU: compute @ ${usd(120)} | FlakyData: enrichment @ ${usd(25)}${X}`);
  head("2. Buyer agent expresses intent -> Manca matches + escrows -> seller fulfills -> auto-settle");
  let m = acme.buy({
    category: "web-scrape",
    spec: { rows: 5e3 },
    maxPrice: 50,
    minReputation: 0,
    referencePrice: 60,
    insured: false,
    verification: { type: "value_threshold", field: "rows", min: 5e3 },
    deadline: Date.now() + 6e4
  });
  let t = hub.match(m.id);
  line(`  matched ${C}web-scrape${X} -> escrow locked ${usd(acme.view().escrowLocked)} (autonomy limit ${usd(acme.view().autonomousSpendLimit)})`);
  let r = await scrapers.fulfill(t.id, { rows: 5200 });
  line(`  fulfillment verdict: ${r.verdict.verified ? G + "VERIFIED" : R + "REJECTED"}${X} (${r.verdict.reason}) -> ${G}settled${X}, seller paid ${usd(scrapers.view().balance)}`);
  line(`  ${D}settled on ${r.trade.settlementRail}/${r.trade.settlementMode}, tx ${String(r.trade.settlementTx).slice(0, 18)}\u2026${X}`);
  m = acme.buy({
    category: "compute",
    spec: { gpu: "h100" },
    maxPrice: 150,
    minReputation: 0,
    referencePrice: 140,
    insured: true,
    verification: { type: "http_ok", url: "https://nimbus.example/job/healthy", expectStatus: 200 },
    deadline: Date.now() + 6e4
  });
  t = hub.match(m.id);
  line(`  matched ${C}compute${X} (insured) -> premium into pool ${usd(hub.insurancePool)}`);
  r = await gpu.fulfill(t.id, { done: true });
  line(`  fulfillment verdict: ${r.verdict.verified ? G + "VERIFIED" : R + "REJECTED"}${X} -> ${G}settled${X}, seller paid ${usd(gpu.view().balance)}`);
  head("3. A seller fails to deliver -> escrow auto-refunds the buyer, reputation drops");
  m = acme.buy({
    category: "data-enrichment",
    spec: { records: 1e3 },
    maxPrice: 30,
    minReputation: 0,
    insured: true,
    verification: { type: "json_schema", requires: { delivered: true } },
    deadline: Date.now() - 1
    // overdue immediately to simulate a miss
  });
  t = hub.match(m.id);
  const repBefore = flaky.view().reputation;
  const failed = hub.expire(Date.now());
  line(`  ${R}${failed} trade failed${X}: buyer refunded (balance ${usd(acme.view().balance)}), FlakyData reputation ${repBefore} -> ${flaky.view().reputation}`);
  head("4. The network P&L \u2014 profitable from the first cleared trade");
  const rep = hub.revenueReport();
  for (const [k, v] of Object.entries(rep.breakdown)) {
    const col = v >= 0 ? G : R;
    line(`  ${k.padEnd(30)} ${col}${usd(v)}${X}`);
  }
  line(`  ${B}${"TOTAL NETWORK REVENUE".padEnd(30)} ${G}${usd(rep.total)}${X}`);
  line(`  ${D}settled: ${rep.settled} | failed: ${rep.failed} | insurance pool: ${usd(rep.insurancePool)}${X}`);
  head("Reputation graph (the compounding moat)");
  for (const a of [acme, scrapers, gpu, flaky]) {
    const v = a.view();
    line(`  ${v.label.padEnd(28)} rep ${Y}${v.reputation}${X}  ok ${v.successfulTrades}  fail ${v.failedTrades}  autonomy ${usd(v.autonomousSpendLimit)}`);
  }
  line();
}
var B, D, G, Y, C, R, X, usd;
var init_demo = __esm({
  "src/demo.ts"() {
    "use strict";
    init_store();
    init_clearinghouse();
    init_config();
    init_agent();
    B = "\x1B[1m";
    D = "\x1B[2m";
    G = "\x1B[32m";
    Y = "\x1B[33m";
    C = "\x1B[36m";
    R = "\x1B[31m";
    X = "\x1B[0m";
    usd = (n) => `$${n.toFixed(4)}`;
    main().catch((e) => {
      console.error("demo error:", e);
      process.exit(1);
    });
  }
});

// src/cli.ts
init_crypto();
init_config();
import { writeFileSync as writeFileSync2, existsSync as existsSync3, mkdirSync as mkdirSync2 } from "node:fs";
import { randomBytes as randomBytes3 } from "node:crypto";
var cmd = process.argv[2];
async function main2() {
  switch (cmd) {
    case "init": {
      mkdirSync2(".manca", { recursive: true });
      if (existsSync3(".manca/network.json")) {
        console.log("network already initialized at .manca/network.json");
        return;
      }
      const kp = newKeyPair();
      const networkId = "manca_" + randomBytes3(8).toString("hex");
      writeFileSync2(
        ".manca/network.json",
        JSON.stringify({ networkId, ...kp, createdAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2)
      );
      console.log(`initialized network ${networkId}`);
      console.log(`private key written to .manca/network.json (gitignored)`);
      console.log(`config: ${configPath()}`);
      break;
    }
    case "serve": {
      const { startHttp: startHttp2 } = await Promise.resolve().then(() => (init_http(), http_exports));
      startHttp2(Number(process.env.PORT ?? 8787));
      break;
    }
    case "mcp": {
      const { startMcp: startMcp2 } = await Promise.resolve().then(() => (init_mcp(), mcp_exports));
      await startMcp2();
      break;
    }
    case "x402:status": {
      const { loadConfig: loadConfig2 } = await Promise.resolve().then(() => (init_config(), config_exports));
      const { buildRail: buildRail2 } = await Promise.resolve().then(() => (init_settlement(), settlement_exports));
      const rail = await buildRail2(loadConfig2());
      console.log(JSON.stringify(rail.status(), null, 2));
      const mode = rail.status().mode;
      if (mode === "mock") {
        console.log("\nMock mode \u2014 nothing real moves. To go live on Base Sepolia testnet:");
        console.log("  1) set manca.config.json settlement.x402.mode = 'testnet'");
        console.log("  2) npm i viem");
        console.log("  3) export X402_PRIVATE_KEY=0x<manca escrow wallet with testnet USDC>");
        console.log("  4) give sellers a payoutAddress (EVM). Then trades settle real testnet USDC.");
      }
      break;
    }
    case "demo": {
      await Promise.resolve().then(() => (init_demo(), demo_exports));
      break;
    }
    default:
      console.log("Manca \u2014 the missing trust layer for agent-to-agent commerce");
      console.log("usage: manca <init|serve|mcp|demo>");
      console.log("  init   generate this deployment's unique network identity");
      console.log("  serve  start the HTTP clearing API (PORT env, default 8787)");
      console.log("  mcp    start the MCP server on stdio (one config, any agent)");
      console.log("  demo   run the end-to-end A2A settlement demo");
  }
}
main2().catch((e) => {
  console.error(e);
  process.exit(1);
});
