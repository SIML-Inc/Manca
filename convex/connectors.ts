import { v } from "convex/values";
import { action, internalAction, mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import * as Model from "./model";
import { fetchShopifyCatalog } from "./connectors/shopify";
import type { NormalizedProduct } from "./connectors/types";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

async function requireUser(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("unauthenticated");
  return userId;
}

const productValidator = v.object({
  externalId: v.string(),
  title: v.string(),
  price: v.number(),
  currency: v.string(),
  sku: v.optional(v.string()),
  available: v.number(),
  category: v.string(),
  imageUrl: v.optional(v.string()),
  productUrl: v.optional(v.string()),
});

// ---------- Shopify: one-click, no approval ----------
export const connectShopify = action({
  args: { accountId: v.id("accounts"), shopUrl: v.string() },
  handler: async (ctx, { accountId, shopUrl }): Promise<any> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("unauthenticated");
    const products = await fetchShopifyCatalog(shopUrl);
    return ctx.runMutation(internal.connectors.upsertCatalog, {
      userId, accountId, platform: "shopify", shopUrl, products,
    });
  },
});

// Same import, but callable from the API-key surfaces (REST + MCP) so an agent
// can put a whole store on the network in one call.
export const connectShopifyInternal = internalAction({
  args: { userId: v.id("users"), accountId: v.id("accounts"), shopUrl: v.string() },
  handler: async (ctx, { userId, accountId, shopUrl }): Promise<any> => {
    const products = await fetchShopifyCatalog(shopUrl);
    return ctx.runMutation(internal.connectors.upsertCatalog, {
      userId, accountId, platform: "shopify", shopUrl, products,
    });
  },
});

export const syncConnection = action({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }): Promise<any> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("unauthenticated");
    const conn = await ctx.runQuery(internal.connectors.getConnection, { connectionId });
    if (!conn || conn.userId !== userId) throw new Error("connection not found");
    if (conn.platform !== "shopify" || !conn.shopUrl) throw new Error("only Shopify connections can sync without credentials");
    const products = await fetchShopifyCatalog(conn.shopUrl);
    return ctx.runMutation(internal.connectors.upsertCatalog, {
      userId, accountId: conn.accountId, platform: "shopify", shopUrl: conn.shopUrl, products,
    });
  },
});

// ---------- other platforms: real adapters, gated on developer-app creds ----------
function requireEnv(...names: string[]): void {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(
      `This marketplace needs a registered developer app. Set ${missing.join(", ")} on the Convex deployment, then reconnect. ` +
        `See docs/CONNECTORS.md for how to register the app and obtain these.`,
    );
  }
}

export const connectAmazon = action({
  args: { accountId: v.id("accounts"), sellerId: v.string(), refreshToken: v.string() },
  handler: async (ctx): Promise<never> => {
    await getAuthUserId(ctx);
    // Amazon SP-API: LWA token exchange -> Listings/Inventory. Gated until the
    // SP-API developer app is registered and approved.
    requireEnv("AMAZON_SP_CLIENT_ID", "AMAZON_SP_CLIENT_SECRET");
    throw new Error("Amazon SP-API app configured but the import adapter is pending live credentials verification.");
  },
});

export const connectTikTok = action({
  args: { accountId: v.id("accounts"), authCode: v.string() },
  handler: async (ctx): Promise<never> => {
    await getAuthUserId(ctx);
    requireEnv("TIKTOK_APP_KEY", "TIKTOK_APP_SECRET");
    throw new Error("TikTok Shop app configured but the import adapter is pending live credentials verification.");
  },
});

export const connectEbay = action({
  args: { accountId: v.id("accounts"), authCode: v.string() },
  handler: async (ctx): Promise<never> => {
    await getAuthUserId(ctx);
    requireEnv("EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET");
    throw new Error("eBay app configured but the import adapter is pending live credentials verification.");
  },
});

// ---------- shared upsert (transactional) ----------
export const upsertCatalog = internalMutation({
  args: {
    userId: v.id("users"),
    accountId: v.id("accounts"),
    platform: v.union(v.literal("shopify"), v.literal("amazon"), v.literal("tiktok"), v.literal("ebay"), v.literal("woocommerce")),
    shopUrl: v.optional(v.string()),
    products: v.array(productValidator),
  },
  handler: async (ctx, { userId, accountId, platform, shopUrl, products }) => {
    const account = await ctx.db.get(accountId);
    if (!account || account.userId !== userId) throw new Error("account belongs to another user");

    // Connecting a real store makes you a verified supplier.
    await Model.becomeSupplier(ctx, userId, accountId);

    // Find or create the connection for this account+platform+shop.
    const existingConns = await ctx.db.query("connections").withIndex("by_account", (q) => q.eq("accountId", accountId)).collect();
    let conn = existingConns.find((c) => c.platform === platform && c.shopUrl === shopUrl);
    if (!conn) {
      const id = await ctx.db.insert("connections", {
        userId, accountId, platform, shopUrl, status: "syncing", productCount: 0,
      });
      conn = (await ctx.db.get(id))!;
    }

    // Index existing imported offers by externalId for resync.
    const priorOffers = await ctx.db.query("offers").withIndex("by_connection", (q) => q.eq("connectionId", conn!._id)).collect();
    const byExternal = new Map(priorOffers.map((o) => [o.externalId, o]));
    const seen = new Set<string>();

    for (const p of products) {
      seen.add(p.externalId);
      const existing = byExternal.get(p.externalId);
      const fields = {
        category: p.category,
        price: p.price,
        available: p.available,
        active: p.available > 0,
        title: p.title,
        imageUrl: p.imageUrl,
        productUrl: p.productUrl,
        attributes: { sku: p.sku ?? null, currency: p.currency, source: platform },
      };
      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert("offers", {
          sellerId: accountId,
          slaSeconds: 172800, // physical fulfilment default: 48h
          connectionId: conn._id,
          externalId: p.externalId,
          ...fields,
        });
      }
    }

    // Deactivate offers that vanished from the source catalog.
    for (const o of priorOffers) {
      if (!seen.has(o.externalId ?? "")) await ctx.db.patch(o._id, { active: false, available: 0 });
    }

    await ctx.db.patch(conn._id, { status: "connected", productCount: products.length, lastSyncAt: Date.now(), lastError: undefined });
    return { connectionId: conn._id, imported: products.length };
  },
});

// ---------- reads ----------
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db.query("connections").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    return Promise.all(
      rows.map(async (c) => {
        const account = await ctx.db.get(c.accountId);
        return {
          id: c._id,
          platform: c.platform,
          shopUrl: c.shopUrl ?? null,
          status: c.status,
          productCount: c.productCount,
          lastSyncAt: c.lastSyncAt ?? null,
          lastError: c.lastError ?? null,
          account: account?.label ?? "?",
          accountId: c.accountId,
        };
      }),
    );
  },
});

export const products = query({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const conn = await ctx.db.get(connectionId);
    if (!conn || conn.userId !== userId) return [];
    const offers = await ctx.db.query("offers").withIndex("by_connection", (q) => q.eq("connectionId", connectionId)).order("desc").take(60);
    return offers.map((o) => ({
      id: o._id, title: o.title ?? "?", price: o.price, available: o.available,
      active: o.active, category: o.category, imageUrl: o.imageUrl ?? null, productUrl: o.productUrl ?? null,
    }));
  },
});

export const getConnection = internalQuery({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => ctx.db.get(connectionId),
});

export const platformStatus = query({
  args: {},
  handler: async () => ({
    shopify: { live: true, needsApp: false },
    amazon: { live: !!process.env.AMAZON_SP_CLIENT_ID, needsApp: true },
    tiktok: { live: !!process.env.TIKTOK_APP_KEY, needsApp: true },
    ebay: { live: !!process.env.EBAY_CLIENT_ID, needsApp: true },
  }),
});

export const disconnect = mutation({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    const userId = await requireUser(ctx);
    const conn = await ctx.db.get(connectionId);
    if (!conn || conn.userId !== userId) throw new Error("connection not found");
    const offers = await ctx.db.query("offers").withIndex("by_connection", (q) => q.eq("connectionId", connectionId)).collect();
    for (const o of offers) await ctx.db.patch(o._id, { active: false, available: 0 });
    await ctx.db.patch(connectionId, { status: "disconnected" });
    return { ok: true };
  },
});
