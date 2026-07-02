import { v } from "convex/values";
import { mutation, query, action, internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { verificationValidator } from "./schema";
import * as Model from "./model";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

async function requireUser(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("unauthenticated");
  return userId;
}

const offerArgs = {
  sellerId: v.id("accounts"),
  category: v.string(),
  attributes: v.optional(v.any()),
  price: v.number(),
  slaSeconds: v.optional(v.number()),
  available: v.optional(v.number()),
  title: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  imageStorageId: v.optional(v.id("_storage")),
  floorPrice: v.optional(v.number()),
  description: v.optional(v.string()),
};

const mandateArgs = {
  buyerId: v.id("accounts"),
  category: v.string(),
  spec: v.optional(v.any()),
  maxPrice: v.number(),
  minReputation: v.optional(v.number()),
  referencePrice: v.optional(v.number()),
  insured: v.optional(v.boolean()),
  verification: verificationValidator,
  deadline: v.number(),
};

// ---------- session (dashboard) ----------
export const sell = mutation({
  args: offerArgs,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const { imageStorageId, ...rest } = args;
    // A freshly uploaded photo takes precedence over a pasted URL.
    const imageUrl = imageStorageId ? (await ctx.storage.getUrl(imageStorageId)) ?? args.imageUrl : args.imageUrl;
    return Model.postOffer(ctx, userId, { ...rest, imageUrl });
  },
});

export const buy = mutation({
  args: mandateArgs,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return Model.postMandate(ctx, userId, args);
  },
});

export const match = mutation({
  args: { mandateId: v.id("mandates") },
  handler: async (ctx, { mandateId }) => {
    const userId = await requireUser(ctx);
    return Model.match(ctx, userId, mandateId);
  },
});

// Buy a specific offer outright at its list price (fixed-price purchase, no
// negotiation). Locks a trade in escrow; the seller fulfils to settle.
async function doBuyNow(ctx: any, userId: Id<"users">, a: { buyerId: Id<"accounts">; offerId: Id<"offers">; insured?: boolean; verification?: any }) {
  const offer = await ctx.db.get(a.offerId);
  if (!offer || !offer.active || offer.available <= 0) throw new Error("offer no longer available");
  return Model.executeNegotiatedTrade(ctx, userId, {
    buyerId: a.buyerId, offerId: a.offerId, agreedPrice: offer.price,
    insured: a.insured ?? false, verification: a.verification ?? { type: "manual" },
    referencePrice: offer.price, deadline: Date.now() + 48 * 3600 * 1000,
  });
}

export const buyNow = mutation({
  args: { buyerId: v.id("accounts"), offerId: v.id("offers"), insured: v.optional(v.boolean()), verification: v.optional(verificationValidator) },
  handler: async (ctx, a) => doBuyNow(ctx, await requireUser(ctx), a),
});

export const buyNowInternal = internalMutation({
  args: { userId: v.id("users"), buyerId: v.id("accounts"), offerId: v.id("offers"), insured: v.optional(v.boolean()), verification: v.optional(verificationValidator) },
  handler: async (ctx, { userId, ...a }) => doBuyNow(ctx, userId, a),
});

// Dashboard fulfill: derives the user from the session, then runs the same
// probe-aware flow as the API-key path so http_ok rules also settle.
export const fulfill = action({
  args: { tradeId: v.id("trades"), payload: v.any() },
  handler: async (ctx, args): Promise<unknown> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("unauthenticated");
    return ctx.runAction(internal.market.fulfillProbe, { userId, ...args });
  },
});

export const sweepExpired = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return { failed: await Model.expire(ctx) };
  },
});

// ---------- dashboard read models (shared network is public) ----------
export const offers = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("offers").order("desc").take(100);
    return Promise.all(
      rows.map(async (o) => {
        const seller = await ctx.db.get(o.sellerId);
        return {
          id: o._id,
          category: o.category,
          price: o.price,
          available: o.available,
          active: o.active,
          slaSeconds: o.slaSeconds,
          seller: seller?.label ?? "?",
          sellerReputation: seller?.reputation ?? 0,
          title: o.title ?? null,
          description: o.description ?? null,
          imageUrl: o.imageUrl ?? null,
          productUrl: o.productUrl ?? null,
          negotiable: o.floorPrice !== undefined,
        };
      }),
    );
  },
});

export const mandates = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const mine = await ctx.db.query("accounts").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const ids = new Set(mine.map((a) => a._id));
    const rows = await ctx.db.query("mandates").order("desc").take(200);
    return rows
      .filter((m) => ids.has(m.buyerId))
      .map((m) => ({
        id: m._id,
        category: m.category,
        maxPrice: m.maxPrice,
        insured: m.insured,
        status: m.status,
        deadline: m.deadline,
        verification: m.verification,
      }));
  },
});

export const trades = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("trades").order("desc").take(100);
    return Promise.all(
      rows.map(async (t) => {
        const buyer = await ctx.db.get(t.buyerId);
        const seller = await ctx.db.get(t.sellerId);
        const mandate = await ctx.db.get(t.mandateId);
        return {
          id: t._id,
          category: mandate?.category ?? "?",
          buyer: buyer?.label ?? "?",
          seller: seller?.label ?? "?",
          buyerId: t.buyerId,
          sellerId: t.sellerId,
          price: t.price,
          insured: t.insured,
          status: t.status,
          verification: t.verification,
          tx: t.settlementTx ?? null,
          settlementMode: t.settlementMode ?? null,
        };
      }),
    );
  },
});

// ---------- http_ok deferred settlement (needs a network probe) ----------
export const settleHttpProbe = internalMutation({
  args: { userId: v.id("users"), tradeId: v.id("trades"), status: v.number() },
  handler: async (ctx, { userId, tradeId, status }) => {
    const trade = await ctx.db.get(tradeId);
    if (!trade || trade.status !== "matched") return { settled: false, reason: "trade not open" };
    const seller = await ctx.db.get(trade.sellerId);
    if (!seller || seller.userId !== userId) return { settled: false, reason: "not owner" };
    const rule = trade.verification;
    if (rule.type !== "http_ok") return { settled: false, reason: "not an http_ok rule" };
    const want = rule.expectStatus ?? 200;
    if (status !== want) return { settled: false, reason: `http ${status} != ${want}` };
    await Model.settle(ctx, trade);
    return { settled: true, reason: `http ${status}` };
  },
});

// Runs the fulfill mutation; if the rule is http_ok it probes the URL (fetch is
// available in the default action runtime) and then settles.
export const fulfillProbe = internalAction({
  args: { userId: v.id("users"), tradeId: v.id("trades"), payload: v.any() },
  handler: async (ctx, { userId, tradeId, payload }): Promise<any> => {
    const first = await ctx.runMutation(internal.market.fulfillInternal, { userId, tradeId, payload });
    if (!first.verdict.deferred) return first;
    const rule = first.trade.verification as { type: string; url?: string };
    let status = 0;
    try {
      const res = await fetch(rule.url!, { method: "HEAD" });
      status = res.status;
    } catch {
      status = 0;
    }
    const settled = await ctx.runMutation(internal.market.settleHttpProbe, { userId, tradeId, status });
    return { ...first, verdict: { ...first.verdict, verified: settled.settled, reason: settled.reason, deferred: false } };
  },
});

// ---------- internal (HTTP / API-key path) ----------
export const sellInternal = internalMutation({
  args: { userId: v.id("users"), ...offerArgs },
  handler: async (ctx, { userId, ...args }) => Model.postOffer(ctx, userId, args),
});

export const buyInternal = internalMutation({
  args: { userId: v.id("users"), ...mandateArgs },
  handler: async (ctx, { userId, ...args }) => Model.postMandate(ctx, userId, args),
});

export const matchInternal = internalMutation({
  args: { userId: v.id("users"), mandateId: v.id("mandates") },
  handler: async (ctx, { userId, mandateId }) => Model.match(ctx, userId, mandateId),
});

export const fulfillInternal = internalMutation({
  args: { userId: v.id("users"), tradeId: v.id("trades"), payload: v.any() },
  handler: async (ctx, { userId, tradeId, payload }) => Model.fulfill(ctx, userId, tradeId, payload),
});
