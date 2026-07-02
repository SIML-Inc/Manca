// Static network configuration for Manca Prime — the single shared clearing
// network. Ported from manca.config.json so the Convex runtime needs no fs
// access. Change these to retune fees, float, insurance, and reputation.

export const MANCA_CONFIG = {
  network: {
    id: "manca_prime",
    name: "Manca Prime",
    settlementAsset: "USDC",
  },
  clearing: {
    clearingFeeBps: 50,
    clearingFeePayer: "buyer" as "buyer" | "seller" | "split",
    minTradeValue: 0.01,
    mandateTtlSeconds: 3600,
  },
  float: { floatApyBps: 420, floatBeneficiary: "network" },
  savingsShare: { enabled: true, savingsShareBps: 1500 },
  insurance: { enabled: true, premiumBps: 200, poolFloor: 0, maxCoverageMultiple: 1.0 },
  verifiedSupply: { subscriptionMonthlyUsd: 99, verificationRequired: true },
  reputation: {
    startScore: 500,
    minScore: 0,
    maxScore: 1000,
    successDelta: 12,
    failureDelta: 40,
    maxSpendCeilingUsd: 100000,
  },
  risk: { minReputationToSell: 250, premiumReputationPivot: 700 },
  settlement: {
    // "mock" settles instantly in-ledger with a synthetic tx hash (launch
    // default, no real funds). "testnet"/"mainnet" route through the x402
    // Node action (convex/node/x402.ts).
    rail: "mock" as "mock" | "testnet" | "mainnet",
  },
} as const;

export type MancaConfig = typeof MANCA_CONFIG;

export function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
