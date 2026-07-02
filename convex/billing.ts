// Real-money balance top-ups via Stripe Checkout.
//
// Flow: user picks an amount -> createTopup opens a Stripe Checkout Session
// (card payment) -> Stripe redirects back to the dashboard -> Stripe calls our
// webhook -> we RE-FETCH the session from Stripe's API using our secret key
// (we never trust the webhook body itself) -> if paid, credit the account,
// exactly once.
//
// Gated on STRIPE_SECRET_KEY. Until it is set, the dashboard shows that card
// payments are not enabled yet and no free money can enter the network.
import { v } from "convex/values";
import { action, query, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { round } from "./lib/config";

const STRIPE_API = "https://api.stripe.com/v1";
const MIN_TOPUP_USD = 5;
const MAX_TOPUP_USD = 10_000;

function form(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export const config = query({
  args: {},
  handler: async () => ({
    stripeEnabled: !!process.env.STRIPE_SECRET_KEY,
    testCreditsEnabled: process.env.ALLOW_TEST_CREDITS === "1",
    minTopupUsd: MIN_TOPUP_USD,
    maxTopupUsd: MAX_TOPUP_USD,
  }),
});

export const createTopup = action({
  args: { accountId: v.id("accounts"), amountUsd: v.number() },
  handler: async (ctx, { accountId, amountUsd }): Promise<{ url: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("unauthenticated");
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Card payments are not enabled yet on this network.");
    if (!(amountUsd >= MIN_TOPUP_USD && amountUsd <= MAX_TOPUP_USD))
      throw new Error(`Top-up must be between $${MIN_TOPUP_USD} and $${MAX_TOPUP_USD}.`);

    const account = await ctx.runQuery(internal.billing.ownedAccount, { userId, accountId });
    if (!account) throw new Error("account not found");

    const site = process.env.SITE_URL ?? "https://trymanca.ai";
    const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form({
        mode: "payment",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][product_data][name]": `Manca balance top-up (${account.label})`,
        "line_items[0][price_data][unit_amount]": String(Math.round(amountUsd * 100)),
        "line_items[0][quantity]": "1",
        success_url: `${site}/dashboard?topup=success`,
        cancel_url: `${site}/dashboard?topup=cancelled`,
        "metadata[accountId]": accountId,
        "metadata[userId]": userId,
      }),
    });
    const session = (await res.json()) as { id?: string; url?: string; error?: { message: string } };
    if (!res.ok || !session.id || !session.url)
      throw new Error(`stripe: ${session.error?.message ?? res.status}`);

    await ctx.runMutation(internal.billing.recordPending, {
      userId, accountId, amountUsd, stripeSessionId: session.id,
    });
    return { url: session.url };
  },
});

export const ownedAccount = internalQuery({
  args: { userId: v.id("users"), accountId: v.id("accounts") },
  handler: async (ctx, { userId, accountId }) => {
    const a = await ctx.db.get(accountId);
    return a && a.userId === userId ? a : null;
  },
});

export const recordPending = internalMutation({
  args: { userId: v.id("users"), accountId: v.id("accounts"), amountUsd: v.number(), stripeSessionId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("topups", { ...args, status: "pending" });
  },
});

// Called by the /stripe/webhook http route with a session id taken from the
// event. We verify by fetching the session from Stripe directly.
export const settleTopup = internalMutation({
  args: { stripeSessionId: v.string(), paid: v.boolean() },
  handler: async (ctx, { stripeSessionId, paid }) => {
    const t = await ctx.db.query("topups").withIndex("by_session", (q) => q.eq("stripeSessionId", stripeSessionId)).unique();
    if (!t || t.status !== "pending") return { credited: false, reason: "no pending topup" };
    if (!paid) {
      await ctx.db.patch(t._id, { status: "failed" });
      return { credited: false, reason: "not paid" };
    }
    const account = await ctx.db.get(t.accountId);
    if (!account) return { credited: false, reason: "account gone" };
    await ctx.db.patch(account._id, { balance: round(account.balance + t.amountUsd) });
    await ctx.db.patch(t._id, { status: "credited", creditedAt: Date.now() });
    return { credited: true, amount: t.amountUsd };
  },
});

export const history = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db.query("topups").withIndex("by_user", (q) => q.eq("userId", userId)).order("desc").take(20);
    return rows.map((t) => ({ id: t._id, amountUsd: t.amountUsd, status: t.status, createdAt: t._creationTime }));
  },
});
