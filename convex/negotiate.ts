import { v } from "convex/values";
import { action, internalAction, internalQuery, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { verificationValidator } from "./schema";
import * as Model from "./model";
import { negotiateDeterministic, clampOutcome, type NegotiationResult } from "./negotiate/engine";
import { negotiateWithLLM } from "./negotiate/llm";
import type { Id } from "./_generated/dataModel";

const negoArgs = {
  buyerId: v.id("accounts"),
  offerId: v.id("offers"),
  buyerMax: v.number(),
  execute: v.optional(v.boolean()), // lock a trade at the agreed price (default true)
  insured: v.optional(v.boolean()),
  verification: v.optional(verificationValidator),
};

// ---------- session (dashboard) ----------
export const negotiate = action({
  args: negoArgs,
  handler: async (ctx, args): Promise<any> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("unauthenticated");
    return ctx.runAction(internal.negotiate.run, { userId, ...args });
  },
});

// ---------- core (also the API-key / MCP path) ----------
export const run = internalAction({
  args: { userId: v.id("users"), ...negoArgs },
  handler: async (ctx, { userId, buyerId, offerId, buyerMax, execute, insured, verification }): Promise<any> => {
    const offer = await ctx.runQuery(internal.negotiate.offerForNego, { offerId });
    if (!offer) throw new Error("offer not found");
    if (!offer.active || offer.available <= 0) throw new Error("offer no longer available");

    const listPrice = offer.price;
    const floorPrice = offer.floorPrice ?? offer.price; // firm if no floor set

    // The buyer's agent must never agree to a price the wallet cannot actually
    // settle once the clearing fee (and insurance premium, if chosen) is added.
    // effectiveMax = min(stated ceiling, what the balance truly affords).
    const buyer = await ctx.runQuery(internal.negotiate.buyerForNego, { userId, buyerId });
    if (!buyer) throw new Error("buyer account not found");
    const { MANCA_CONFIG } = await import("./lib/config");
    const { riskAdjustedPremiumBps } = await import("./lib/clearing");
    const feeRate = MANCA_CONFIG.clearing.clearingFeeBps / 10_000;
    const premiumRate = insured ? riskAdjustedPremiumBps(offer.sellerReputation) / 10_000 : 0;
    const affordable = Math.floor((buyer.balance / (1 + feeRate + premiumRate)) * 100) / 100;
    const effectiveMax = Math.min(buyerMax, affordable);
    if (effectiveMax <= 0)
      throw new Error(`buyer balance ${buyer.balance} cannot cover any price plus fees — top up first`);

    let engine = process.env.NEGOTIATION_MODEL || "z-ai/glm-4.6";
    let result: NegotiationResult;
    try {
      result = clampOutcome(
        await negotiateWithLLM({ title: offer.title ?? offer.category, category: offer.category, listPrice, floorPrice, buyerMax: effectiveMax }),
        floorPrice,
        effectiveMax,
      );
    } catch {
      engine = "deterministic";
      result = negotiateDeterministic(listPrice, floorPrice, effectiveMax);
    }
    // A buyer never pays above list price.
    if (result.status === "agreed" && result.agreedPrice !== undefined)
      result.agreedPrice = Math.min(result.agreedPrice, listPrice);

    return ctx.runMutation(internal.negotiate.finalize, {
      userId, buyerId, sellerId: offer.sellerId, offerId, category: offer.category,
      listPrice, floorPrice, buyerMax, engine,
      rounds: result.rounds, status: result.status, agreedPrice: result.agreedPrice,
      execute: execute !== false, insured: insured ?? false, verification,
    });
  },
});

export const offerForNego = internalQuery({
  args: { offerId: v.id("offers") },
  handler: async (ctx, { offerId }) => {
    const offer = await ctx.db.get(offerId);
    if (!offer) return null;
    const seller = await ctx.db.get(offer.sellerId);
    return { ...offer, sellerReputation: seller?.reputation ?? 500 };
  },
});

export const buyerForNego = internalQuery({
  args: { userId: v.id("users"), buyerId: v.id("accounts") },
  handler: async (ctx, { userId, buyerId }) => {
    const a = await ctx.db.get(buyerId);
    return a && a.userId === userId ? { balance: a.balance } : null;
  },
});

export const finalize = internalMutation({
  args: {
    userId: v.id("users"),
    buyerId: v.id("accounts"),
    sellerId: v.id("accounts"),
    offerId: v.id("offers"),
    category: v.string(),
    listPrice: v.number(),
    floorPrice: v.number(),
    buyerMax: v.number(),
    engine: v.string(),
    rounds: v.array(v.object({ actor: v.union(v.literal("buyer"), v.literal("seller")), price: v.number(), message: v.string() })),
    status: v.union(v.literal("agreed"), v.literal("failed")),
    agreedPrice: v.optional(v.number()),
    execute: v.boolean(),
    insured: v.boolean(),
    verification: v.optional(verificationValidator),
  },
  handler: async (ctx, a): Promise<any> => {
    const negId = await ctx.db.insert("negotiations", {
      buyerId: a.buyerId, sellerId: a.sellerId, offerId: a.offerId, category: a.category,
      listPrice: a.listPrice, floorPrice: a.floorPrice, buyerMax: a.buyerMax,
      rounds: a.rounds, status: a.status, agreedPrice: a.agreedPrice, engine: a.engine,
    });

    let tradeId: Id<"trades"> | undefined;
    let tradeError: string | undefined;
    let savedVsList = 0;
    if (a.status === "agreed" && a.agreedPrice !== undefined && a.execute) {
      try {
        const trade = await Model.executeNegotiatedTrade(ctx, a.userId, {
          buyerId: a.buyerId,
          offerId: a.offerId,
          agreedPrice: a.agreedPrice,
          verification: (a.verification as any) ?? { type: "manual" },
          insured: a.insured,
          referencePrice: a.listPrice,
          deadline: Date.now() + 48 * 3600 * 1000,
        });
        tradeId = trade._id;
        savedVsList = Math.round((a.listPrice - a.agreedPrice) * 100) / 100;
        await ctx.db.patch(negId, { tradeId });
      } catch (e) {
        tradeError = (e as Error).message;
      }
    }

    return {
      negotiationId: negId,
      status: a.status,
      agreedPrice: a.agreedPrice ?? null,
      listPrice: a.listPrice,
      floorPrice: a.floorPrice,
      savedVsList,
      rounds: a.rounds,
      engine: a.engine,
      tradeId: tradeId ?? null,
      tradeError: tradeError ?? null,
    };
  },
});

// ---------- reads ----------
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const mine = await ctx.db.query("accounts").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const ids = new Set(mine.map((a) => a._id));
    const rows = await ctx.db.query("negotiations").order("desc").take(100);
    return rows
      .filter((n) => ids.has(n.buyerId) || ids.has(n.sellerId))
      .map((n) => ({
        id: n._id, category: n.category, listPrice: n.listPrice, floorPrice: n.floorPrice,
        buyerMax: n.buyerMax, status: n.status, agreedPrice: n.agreedPrice ?? null,
        rounds: n.rounds, engine: n.engine, tradeId: n.tradeId ?? null, createdAt: n._creationTime,
      }));
  },
});
