// Pure clearing math — ported verbatim from the Manca SDK core so the hosted
// clearinghouse and the npm SDK stay behaviorally identical. No I/O, no Convex
// types: these are called from mutations with plain numbers/objects.
import { MANCA_CONFIG, round } from "./config";
import { sha256 } from "./sha256";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const cfg = MANCA_CONFIG;

// ---- revenue ----
export function clearingFee(value: number): number {
  return (value * cfg.clearing.clearingFeeBps) / 10_000;
}
export function floatYield(principal: number, heldMs: number): number {
  const apy = cfg.float.floatApyBps / 10_000;
  return principal * apy * (heldMs / YEAR_MS);
}
export function savingsShare(referencePrice: number | undefined, clearedPrice: number): number {
  if (!cfg.savingsShare.enabled || referencePrice === undefined) return 0;
  const saved = referencePrice - clearedPrice;
  if (saved <= 0) return 0;
  return (saved * cfg.savingsShare.savingsShareBps) / 10_000;
}

// ---- reputation / underwriting ----
export function clampScore(score: number): number {
  return Math.max(cfg.reputation.minScore, Math.min(cfg.reputation.maxScore, score));
}
export function autonomousSpendLimit(reputation: number): number {
  const frac = reputation / cfg.reputation.maxScore;
  return Math.round(frac * cfg.reputation.maxSpendCeilingUsd * 100) / 100;
}
export function riskAdjustedPremiumBps(sellerRep: number): number {
  const pivot = cfg.risk.premiumReputationPivot;
  const base = cfg.insurance.premiumBps;
  if (sellerRep >= pivot) return base;
  const risk = 1 + (2 * (pivot - sellerRep)) / pivot;
  return Math.round(base * risk);
}

// The clearing-fee split between buyer and seller per network policy.
export function buyerClearingFeeShare(fee: number): number {
  return cfg.clearing.clearingFeePayer === "seller"
    ? 0
    : cfg.clearing.clearingFeePayer === "split"
      ? round(fee / 2)
      : fee;
}

// ---- machine-verifiable fulfillment ----
export type VerificationRule =
  | { type: "json_schema"; requires: Record<string, unknown> }
  | { type: "hash_match"; sha256: string }
  | { type: "value_threshold"; field: string; min: number }
  | { type: "http_ok"; url: string; expectStatus?: number }
  | { type: "manual" };

export interface Verdict {
  verified: boolean;
  reason: string;
  machineAdjudicable: boolean;
  // true when the rule needs a network probe and must be evaluated in an action
  deferred?: boolean;
}

// Evaluate every rule that can be decided with the payload alone. http_ok needs
// a network probe (returned as deferred) and manual needs a human.
export function verifyLocal(rule: VerificationRule, payload: unknown): Verdict {
  switch (rule.type) {
    case "json_schema": {
      if (payload === null || typeof payload !== "object")
        return { verified: false, reason: "payload is not an object", machineAdjudicable: true };
      const obj = payload as Record<string, unknown>;
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
      return { verified: ok, reason: ok ? "hash matched" : "hash mismatch", machineAdjudicable: true };
    }
    case "value_threshold": {
      const obj = (payload ?? {}) as Record<string, unknown>;
      const val = obj[rule.field];
      const ok = typeof val === "number" && val >= rule.min;
      return {
        verified: ok,
        reason: ok ? `${rule.field} >= ${rule.min}` : `${rule.field} below ${rule.min}`,
        machineAdjudicable: true,
      };
    }
    case "http_ok":
      return { verified: false, reason: "http probe deferred", machineAdjudicable: true, deferred: true };
    case "manual":
      return { verified: false, reason: "manual verification required", machineAdjudicable: false };
  }
}
