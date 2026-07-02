import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// The machine-verifiable fulfillment rule carried by every buy mandate. Funds
// only release when the delivered payload provably satisfies this rule.
export const verificationValidator = v.union(
  v.object({ type: v.literal("json_schema"), requires: v.any() }),
  v.object({ type: v.literal("hash_match"), sha256: v.string() }),
  v.object({ type: v.literal("value_threshold"), field: v.string(), min: v.number() }),
  v.object({ type: v.literal("http_ok"), url: v.string(), expectStatus: v.optional(v.number()) }),
  v.object({ type: v.literal("manual") }),
);

export default defineSchema({
  // Convex Auth: users, authSessions, authAccounts, authRefreshTokens,
  // authVerificationCodes, authVerifiers.
  ...authTables,

  // Global network state (single doc): the insurance pool balance. Everything
  // else about the network is static config in convex/lib/config.ts.
  network: defineTable({
    key: v.string(), // always "prime"
    insurancePool: v.number(),
  }).index("by_key", ["key"]),

  // A symmetric clearing account. Every account can BOTH buy and sell, is both
  // rated and rating. Owned by a signed-in user; matching is cross-user.
  accounts: defineTable({
    userId: v.id("users"),
    label: v.string(),
    handle: v.string(), // stable per-user name (used by the MCP custodial path)
    publicKey: v.optional(v.string()), // optional ed25519 SPKI for non-custodial signing
    payoutAddress: v.optional(v.string()), // EVM address for on-chain (x402) settlement
    balance: v.number(),
    escrowLocked: v.number(),
    reputation: v.number(),
    successfulTrades: v.number(),
    failedTrades: v.number(),
    verifiedSupplier: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_handle", ["userId", "handle"]),

  offers: defineTable({
    sellerId: v.id("accounts"),
    category: v.string(),
    attributes: v.any(),
    price: v.number(),
    slaSeconds: v.number(),
    available: v.number(),
    active: v.boolean(),
    description: v.optional(v.string()),
    // Lowest price the seller's agent will accept in negotiation. Undefined
    // means the offer is firm (no haggling room below list price).
    floorPrice: v.optional(v.number()),
    // Provenance when the offer was imported from a connected storefront.
    connectionId: v.optional(v.id("connections")),
    externalId: v.optional(v.string()), // platform product id, for resync dedupe
    title: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    productUrl: v.optional(v.string()),
  })
    .index("by_seller", ["sellerId"])
    .index("by_category_active", ["category", "active"])
    .index("by_connection", ["connectionId"]),

  // A seller's linked storefront. One click for Shopify (public catalog); the
  // other platforms carry OAuth credentials once their developer apps exist.
  connections: defineTable({
    userId: v.id("users"),
    accountId: v.id("accounts"), // the clearing account the imported offers post under
    platform: v.union(
      v.literal("shopify"),
      v.literal("amazon"),
      v.literal("tiktok"),
      v.literal("ebay"),
      v.literal("woocommerce"),
    ),
    shopUrl: v.optional(v.string()),
    externalShopId: v.optional(v.string()),
    credentials: v.optional(v.any()), // tokens for authed platforms (server-side only)
    status: v.union(
      v.literal("connected"),
      v.literal("syncing"),
      v.literal("error"),
      v.literal("disconnected"),
    ),
    productCount: v.number(),
    lastSyncAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_account", ["accountId"]),

  mandates: defineTable({
    buyerId: v.id("accounts"),
    category: v.string(),
    spec: v.any(),
    maxPrice: v.number(),
    minReputation: v.number(),
    referencePrice: v.optional(v.number()),
    insured: v.boolean(),
    verification: verificationValidator,
    deadline: v.number(), // epoch ms
    status: v.union(
      v.literal("open"),
      v.literal("matched"),
      v.literal("settled"),
      v.literal("failed"),
      v.literal("expired"),
    ),
  })
    .index("by_buyer", ["buyerId"])
    .index("by_status", ["status"]),

  trades: defineTable({
    mandateId: v.id("mandates"),
    offerId: v.id("offers"),
    buyerId: v.id("accounts"),
    sellerId: v.id("accounts"),
    price: v.number(),
    clearingFee: v.number(),
    insurancePremium: v.number(),
    insured: v.boolean(),
    referencePrice: v.optional(v.number()),
    lockedAt: v.number(),
    settledAt: v.optional(v.number()),
    status: v.union(v.literal("matched"), v.literal("settled"), v.literal("failed")),
    verification: verificationValidator,
    deadline: v.number(),
    fulfillmentAttempts: v.number(),
    failReason: v.optional(v.string()),
    settlementRail: v.optional(v.string()),
    settlementMode: v.optional(v.string()),
    settlementTx: v.optional(v.union(v.string(), v.null())),
  })
    .index("by_buyer", ["buyerId"])
    .index("by_seller", ["sellerId"])
    .index("by_status", ["status"]),

  revenue: defineTable({
    reason: v.union(
      v.literal("clearing_fee"),
      v.literal("float_yield"),
      v.literal("savings_share"),
      v.literal("insurance_premium"),
      v.literal("verified_supply_subscription"),
    ),
    amount: v.number(),
    tradeId: v.optional(v.id("trades")),
    accountId: v.optional(v.id("accounts")),
    at: v.number(),
    note: v.string(),
  }).index("by_reason", ["reason"]),

  // A recorded agent-to-agent price negotiation over one offer.
  negotiations: defineTable({
    buyerId: v.id("accounts"),
    sellerId: v.id("accounts"),
    offerId: v.id("offers"),
    category: v.string(),
    listPrice: v.number(),
    floorPrice: v.number(),
    buyerMax: v.number(),
    rounds: v.array(
      v.object({
        actor: v.union(v.literal("buyer"), v.literal("seller")),
        price: v.number(),
        message: v.string(),
      }),
    ),
    status: v.union(v.literal("agreed"), v.literal("failed")),
    agreedPrice: v.optional(v.number()),
    tradeId: v.optional(v.id("trades")),
    engine: v.string(), // model slug or "deterministic"
  })
    .index("by_buyer", ["buyerId"])
    .index("by_offer", ["offerId"]),

  // Real-money balance top-ups (Stripe Checkout). A row is created when the
  // checkout session opens and marked credited by the webhook, exactly once.
  topups: defineTable({
    userId: v.id("users"),
    accountId: v.id("accounts"),
    amountUsd: v.number(),
    stripeSessionId: v.string(),
    status: v.union(v.literal("pending"), v.literal("credited"), v.literal("failed")),
    creditedAt: v.optional(v.number()),
  })
    .index("by_session", ["stripeSessionId"])
    .index("by_user", ["userId"]),

  // Per-user API keys for the hosted REST + MCP surface. The full key is shown
  // once at creation; only its sha256 hash is stored.
  apiKeys: defineTable({
    userId: v.id("users"),
    name: v.string(),
    prefix: v.string(), // e.g. "mk_live_a1b2c3d4" — safe to display
    hash: v.string(), // sha256 of the full key
    revoked: v.boolean(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_hash", ["hash"])
    .index("by_user", ["userId"]),
});
