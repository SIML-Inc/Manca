// Dev/test helpers. internal* so they are never publicly callable.
import { internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { sha256 } from "./lib/sha256";
import { fetchShopifyCatalog } from "./connectors/shopify";

// Create a throwaway user and API key for smoke-testing the REST/MCP surface
// without going through the browser auth flow. Returns the raw key once.
export const seedKey = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const userId = await ctx.db.insert("users", { email });
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    const key = `mk_live_${hex}`;
    await ctx.db.insert("apiKeys", { userId, name: "smoke-test", prefix: key.slice(0, 16), hash: sha256(key), revoked: false });
    return { userId, key };
  },
});

// Create a throwaway user+account, then import a real Shopify store's live
// catalog as sell-offers. Exercises the whole connector path end to end.
export const smokeShopify = internalAction({
  args: { shopUrl: v.string() },
  handler: async (ctx, { shopUrl }): Promise<unknown> => {
    const setup = await ctx.runMutation(internal.dev.setupAccount, { email: `shop-${shopUrl}@test` });
    const products = await fetchShopifyCatalog(shopUrl);
    const res = await ctx.runMutation(internal.connectors.upsertCatalog, {
      userId: setup.userId, accountId: setup.accountId, platform: "shopify", shopUrl, products,
    });
    return { imported: res.imported, sample: products.slice(0, 3).map((p) => ({ title: p.title, price: p.price, currency: p.currency, category: p.category, available: p.available })) };
  },
});

export const setupAccount = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const userId = await ctx.db.insert("users", { email });
    const accountId = await ctx.db.insert("accounts", {
      userId, label: "Test Store", handle: "teststore", balance: 0, escrowLocked: 0,
      reputation: 500, successfulTrades: 0, failedTrades: 0, verifiedSupplier: false,
    });
    return { userId, accountId };
  },
});

// A seller with a negotiable offer + a funded buyer, for negotiation smoke tests.
export const setupNegoFixture = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sellerUser = await ctx.db.insert("users", { email: "nego-seller@test" });
    const sellerId = await ctx.db.insert("accounts", {
      userId: sellerUser, label: "Sneaker Co", handle: "sneakerco", balance: 0, escrowLocked: 0,
      reputation: 600, successfulTrades: 0, failedTrades: 0, verifiedSupplier: true,
    });
    const offerId = await ctx.db.insert("offers", {
      sellerId, category: "sneakers", attributes: {}, price: 100, floorPrice: 60,
      slaSeconds: 172800, available: 5, active: true, title: "Limited Runner",
    });
    const buyerUser = await ctx.db.insert("users", { email: "nego-buyer@test" });
    const buyerId = await ctx.db.insert("accounts", {
      userId: buyerUser, label: "ACME", handle: "acme-nego", balance: 500, escrowLocked: 0,
      reputation: 500, successfulTrades: 0, failedTrades: 0, verifiedSupplier: false,
    });
    return { buyerUserId: buyerUser, buyerId, offerId };
  },
});

// Launch reset: wipe all market/ledger data so every balance starts from zero.
// Keeps users and API keys (logins and integrations survive); deletes accounts,
// offers, mandates, trades, negotiations, revenue, connections, topups, network.
export const resetNetwork = internalMutation({
  args: { confirm: v.literal("RESET") },
  handler: async (ctx) => {
    const tables = ["accounts", "offers", "mandates", "trades", "negotiations", "revenue", "connections", "topups", "network"] as const;
    const deleted: Record<string, number> = {};
    for (const t of tables) {
      const rows = await ctx.db.query(t).collect();
      for (const r of rows) await ctx.db.delete(r._id);
      deleted[t] = rows.length;
    }
    return deleted;
  },
});

export const smokeNegotiate = internalAction({
  args: { buyerMax: v.number() },
  handler: async (ctx, { buyerMax }): Promise<unknown> => {
    const f = await ctx.runMutation(internal.dev.setupNegoFixture, {});
    return ctx.runAction(internal.negotiate.run, {
      userId: f.buyerUserId, buyerId: f.buyerId, offerId: f.offerId, buyerMax, execute: true,
      verification: { type: "json_schema", requires: { delivered: true } },
    });
  },
});
