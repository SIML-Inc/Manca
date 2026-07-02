import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { sha256 } from "./lib/sha256";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

async function requireUser(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("unauthenticated");
  return userId;
}

function randomKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `mk_live_${hex}`;
}

// Mint a key. The full secret is returned exactly ONCE; only its hash is stored.
export const mint = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireUser(ctx);
    const key = randomKey();
    const prefix = key.slice(0, 16); // "mk_live_" + 8 hex chars
    await ctx.db.insert("apiKeys", { userId, name, prefix, hash: sha256(key), revoked: false });
    return { key, prefix, name };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db.query("apiKeys").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    return rows.map((k) => ({
      id: k._id,
      name: k.name,
      prefix: k.prefix,
      revoked: k.revoked,
      lastUsedAt: k.lastUsedAt ?? null,
      createdAt: k._creationTime,
    }));
  },
});

export const revoke = mutation({
  args: { keyId: v.id("apiKeys") },
  handler: async (ctx, { keyId }) => {
    const userId = await requireUser(ctx);
    const k = await ctx.db.get(keyId);
    if (!k || k.userId !== userId) throw new Error("key not found");
    await ctx.db.patch(k._id, { revoked: true });
    return { ok: true };
  },
});

// ---------- internal (used by the HTTP surface to authenticate a request) ----------
export const verify = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const hash = sha256(key);
    const row = await ctx.db.query("apiKeys").withIndex("by_hash", (q) => q.eq("hash", hash)).unique();
    if (!row || row.revoked) return null;
    return { userId: row.userId, keyId: row._id };
  },
});

export const touch = internalMutation({
  args: { keyId: v.id("apiKeys") },
  handler: async (ctx, { keyId }) => {
    await ctx.db.patch(keyId, { lastUsedAt: Date.now() });
  },
});
