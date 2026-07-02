import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import * as Model from "./model";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

async function requireUser(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("unauthenticated");
  return userId;
}

// ---------- session (dashboard) ----------
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db.query("accounts").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    return rows.map(Model.accountView);
  },
});

export const get = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const userId = await requireUser(ctx);
    const a = await ctx.db.get(accountId);
    if (!a || a.userId !== userId) return null;
    return Model.accountView(a);
  },
});

export const open = mutation({
  args: { label: v.string(), handle: v.string(), payoutAddress: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return Model.accountView(await Model.register(ctx, userId, args));
  },
});

// Free credits exist ONLY while the network runs in test mode
// (ALLOW_TEST_CREDITS=1 on the deployment). In production money enters
// exclusively through billing.createTopup (Stripe). Everyone starts at zero.
function assertTestCredits() {
  if (process.env.ALLOW_TEST_CREDITS !== "1")
    throw new Error("Free credits are disabled. Top up your balance with a card from the Overview page.");
}

export const deposit = mutation({
  args: { accountId: v.id("accounts"), amount: v.number() },
  handler: async (ctx, { accountId, amount }) => {
    assertTestCredits();
    const userId = await requireUser(ctx);
    return Model.accountView(await Model.deposit(ctx, userId, accountId, amount));
  },
});

export const becomeSupplier = mutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const userId = await requireUser(ctx);
    return Model.accountView(await Model.becomeSupplier(ctx, userId, accountId));
  },
});

export const setPayout = mutation({
  args: { accountId: v.id("accounts"), payoutAddress: v.string() },
  handler: async (ctx, { accountId, payoutAddress }) => {
    const userId = await requireUser(ctx);
    return Model.accountView(await Model.setPayoutAddress(ctx, userId, accountId, payoutAddress));
  },
});

// ---------- internal (HTTP / API-key path) ----------
export const listForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db.query("accounts").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    return rows.map(Model.accountView);
  },
});

export const openInternal = internalMutation({
  args: { userId: v.id("users"), label: v.string(), handle: v.string(), payoutAddress: v.optional(v.string()) },
  handler: async (ctx, { userId, ...args }) => Model.accountView(await Model.register(ctx, userId, args)),
});

export const depositInternal = internalMutation({
  args: { userId: v.id("users"), accountId: v.id("accounts"), amount: v.number() },
  handler: async (ctx, { userId, accountId, amount }) => {
    assertTestCredits();
    return Model.accountView(await Model.deposit(ctx, userId, accountId, amount));
  },
});

export const becomeSupplierInternal = internalMutation({
  args: { userId: v.id("users"), accountId: v.id("accounts") },
  handler: async (ctx, { userId, accountId }) =>
    Model.accountView(await Model.becomeSupplier(ctx, userId, accountId)),
});
