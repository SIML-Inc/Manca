// Settlement rail abstraction. Manca's clearing logic is rail-agnostic: it holds
// escrow and decides *when* a trade settles; the rail decides *how the value
// actually moves*. Default is the internal ledger; x402 moves real USDC.
import type { MancaConfig } from "../types.ts";

export interface SettleRequest {
  from?: string; // payer (Manca escrow wallet, for on-chain rails)
  to: string; // payee address / account
  amount: number; // in settlement asset (e.g. USDC)
  ref: string; // trade id, used as idempotency/reference
}

export interface SettleResult {
  rail: string; // "internal" | "x402"
  mode: string; // "ledger" | "mock" | "testnet" | "mainnet"
  network: string; // e.g. "internal" | "eip155:84532"
  txHash: string | null; // on-chain tx (or mock hash), null for pure ledger
  success: boolean;
  note?: string;
}

export interface SettlementRail {
  readonly name: string;
  settle(req: SettleRequest): Promise<SettleResult>;
  status(): Record<string, unknown>;
}

// The default: value moves only inside Manca's ledger (what the demo/tests use).
export class InternalRail implements SettlementRail {
  readonly name = "internal";
  async settle(_req: SettleRequest): Promise<SettleResult> {
    return { rail: "internal", mode: "ledger", network: "internal", txHash: null, success: true };
  }
  status() {
    return { rail: "internal", mode: "ledger", note: "value moves inside the Manca ledger only" };
  }
}

export async function buildRail(cfg: MancaConfig): Promise<SettlementRail> {
  const s = cfg.settlement;
  if (!s || s.rail === "internal") return new InternalRail();
  if (s.rail === "x402") {
    const { X402Rail } = await import("./x402.ts");
    return new X402Rail(s.x402);
  }
  return new InternalRail();
}
