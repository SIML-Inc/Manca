// The reputation / underwriting graph — Manca's compounding moat. Every
// settled or failed trade updates a counterparty's score, which gates
// autonomous spend limits and prices fulfillment-guarantee insurance.
import type { Account, MancaConfig } from "../types.ts";

export function clampScore(cfg: MancaConfig, score: number): number {
  return Math.max(cfg.reputation.minScore, Math.min(cfg.reputation.maxScore, score));
}

export function applyOutcome(cfg: MancaConfig, acc: Account, success: boolean): void {
  if (success) {
    acc.reputation = clampScore(cfg, acc.reputation + cfg.reputation.successDelta);
    acc.successfulTrades += 1;
  } else {
    acc.reputation = clampScore(cfg, acc.reputation - cfg.reputation.failureDelta);
    acc.failedTrades += 1;
  }
}

// Autonomous spend ceiling scales with reputation: trusted agents get to move
// more money without a human in the loop.
export function autonomousSpendLimit(cfg: MancaConfig, acc: Account): number {
  const frac = acc.reputation / cfg.reputation.maxScore;
  return Math.round(frac * cfg.reputation.maxSpendCeilingUsd * 100) / 100;
}

// Insurance premium is risk-priced: the lower the seller's reputation relative
// to the pivot, the higher the premium. Returns an effective bps.
export function riskAdjustedPremiumBps(cfg: MancaConfig, sellerRep: number): number {
  const pivot = cfg.risk.premiumReputationPivot;
  const base = cfg.insurance.premiumBps;
  if (sellerRep >= pivot) return base;
  // up to 3x base as reputation approaches zero
  const risk = 1 + (2 * (pivot - sellerRep)) / pivot;
  return Math.round(base * risk);
}
