// Manca core domain types. Erasable TypeScript (Node native type-stripping).

export type AssetSymbol = string;

// A clearing account is symmetric: every agent can BOTH buy and sell.
export interface Account {
  id: string;
  label: string;
  publicKey: string; // base64url ed25519 SPKI
  balance: number; // available settlement balance
  escrowLocked: number; // funds currently locked in open trades
  reputation: number;
  successfulTrades: number;
  failedTrades: number;
  verifiedSupplier: boolean; // pays verified-supply subscription
  createdAt: number;
}

// Machine-verifiable fulfillment rule — the mechanism that lets settlement
// happen autonomously with zero humans. This is Manca's core improvement.
export type VerificationRule =
  | { type: "json_schema"; requires: Record<string, unknown> }
  | { type: "hash_match"; sha256: string }
  | { type: "value_threshold"; field: string; min: number }
  | { type: "http_ok"; url: string; expectStatus?: number }
  | { type: "manual" };

export interface BuyMandate {
  id: string;
  buyerId: string;
  category: string;
  spec: Record<string, unknown>;
  maxPrice: number;
  minReputation: number;
  referencePrice?: number; // optional: what the buyer would otherwise pay (drives savings-share)
  insured: boolean; // buyer opts into guaranteed fulfillment
  verification: VerificationRule;
  deadline: number; // epoch ms
  signature: string;
  createdAt: number;
  status: "open" | "matched" | "settled" | "failed" | "expired";
}

export interface SellOffer {
  id: string;
  sellerId: string;
  category: string;
  attributes: Record<string, unknown>;
  price: number;
  slaSeconds: number;
  available: number; // units available
  signature: string;
  createdAt: number;
  active: boolean;
}

export type TradeStatus = "matched" | "settled" | "failed";

export interface Trade {
  id: string;
  mandateId: string;
  offerId: string;
  buyerId: string;
  sellerId: string;
  price: number;
  clearingFee: number;
  insurancePremium: number;
  insured: boolean;
  referencePrice?: number;
  lockedAt: number;
  settledAt?: number;
  status: TradeStatus;
  verification: VerificationRule;
  deadline: number;
  fulfillmentAttempts: number;
  failReason?: string;
}

export type RevenueReason =
  | "clearing_fee"
  | "float_yield"
  | "savings_share"
  | "insurance_premium"
  | "verified_supply_subscription";

export interface RevenueEntry {
  id: string;
  reason: RevenueReason;
  amount: number;
  tradeId?: string;
  accountId?: string;
  at: number;
  note: string;
}

export interface MancaConfig {
  network: {
    id: string;
    name: string;
    publicKey: string;
    settlementAsset: AssetSymbol;
    createdAt: string;
  };
  clearing: {
    clearingFeeBps: number;
    clearingFeePayer: "buyer" | "seller" | "split";
    minTradeValue: number;
    mandateTtlSeconds: number;
  };
  float: { floatApyBps: number; floatBeneficiary: string };
  savingsShare: { enabled: boolean; savingsShareBps: number };
  insurance: {
    enabled: boolean;
    premiumBps: number;
    poolFloor: number;
    maxCoverageMultiple: number;
  };
  verifiedSupply: { subscriptionMonthlyUsd: number; verificationRequired: boolean };
  reputation: {
    startScore: number;
    minScore: number;
    maxScore: number;
    successDelta: number;
    failureDelta: number;
    autonomousSpendCurve: string;
    maxSpendCeilingUsd: number;
  };
  risk: { minReputationToSell: number; premiumReputationPivot: number };
}
