// The monetization engine — money accrues here in real time so the network is
// profitable the moment it clears its first trade. NONE of this is a
// transaction toll on merchants (that model is dead); every stream prices
// risk-removal, float, or realized savings.
import { id } from "./crypto.ts";
import type { RevenueEntry, RevenueReason, MancaConfig } from "../types.ts";
import type { Store } from "./store.ts";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export class RevenueEngine {
  private store: Store;
  private cfg: MancaConfig;
  constructor(store: Store, cfg: MancaConfig) {
    this.store = store;
    this.cfg = cfg;
  }

  record(reason: RevenueReason, amount: number, note: string, tradeId?: string, accountId?: string): RevenueEntry {
    const entry: RevenueEntry = {
      id: id("rev"),
      reason,
      amount: Math.round(amount * 1e6) / 1e6,
      tradeId,
      accountId,
      at: Date.now(),
      note,
    };
    this.store.revenue.push(entry);
    return entry;
  }

  clearingFee(value: number): number {
    return (value * this.cfg.clearing.clearingFeeBps) / 10_000;
  }

  // Float yield earned while funds sat in escrow. Manca (or its reserve pool)
  // earns the time-value of money in flight — the Adyen/Circle mechanic.
  floatYield(principal: number, heldMs: number): number {
    const apy = this.cfg.float.floatApyBps / 10_000;
    return principal * apy * (heldMs / YEAR_MS);
  }

  // Share of realized savings vs the buyer's reference price. Aligned: we only
  // earn when we make the buyer measurably better off.
  savingsShare(referencePrice: number | undefined, clearedPrice: number): number {
    if (!this.cfg.savingsShare.enabled || referencePrice === undefined) return 0;
    const saved = referencePrice - clearedPrice;
    if (saved <= 0) return 0;
    return (saved * this.cfg.savingsShare.savingsShareBps) / 10_000;
  }

  total(): number {
    return this.store.revenue.reduce((s, r) => s + r.amount, 0);
  }

  breakdown(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of this.store.revenue) out[r.reason] = (out[r.reason] ?? 0) + r.amount;
    for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 1e6) / 1e6;
    return out;
  }
}
