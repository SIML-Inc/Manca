// Zero-dependency persistence: in-memory maps with optional JSON snapshot to
// disk. Deliberately swappable for Postgres/Supabase later without touching
// the clearing logic.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Account, BuyMandate, SellOffer, Trade, RevenueEntry } from "../types.ts";

export interface Snapshot {
  accounts: Account[];
  mandates: BuyMandate[];
  offers: SellOffer[];
  trades: Trade[];
  revenue: RevenueEntry[];
}

export class Store {
  accounts = new Map<string, Account>();
  mandates = new Map<string, BuyMandate>();
  offers = new Map<string, SellOffer>();
  trades = new Map<string, Trade>();
  revenue: RevenueEntry[] = [];
  private path: string | null;

  constructor(path: string | null = null) {
    this.path = path;
    if (path && existsSync(path)) this.load();
  }

  private load(): void {
    if (!this.path) return;
    const snap = JSON.parse(readFileSync(this.path, "utf8")) as Snapshot;
    for (const a of snap.accounts) this.accounts.set(a.id, a);
    for (const m of snap.mandates) this.mandates.set(m.id, m);
    for (const o of snap.offers) this.offers.set(o.id, o);
    for (const t of snap.trades) this.trades.set(t.id, t);
    this.revenue = snap.revenue ?? [];
  }

  persist(): void {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const snap: Snapshot = {
      accounts: [...this.accounts.values()],
      mandates: [...this.mandates.values()],
      offers: [...this.offers.values()],
      trades: [...this.trades.values()],
      revenue: this.revenue,
    };
    writeFileSync(this.path, JSON.stringify(snap, null, 2));
  }
}
