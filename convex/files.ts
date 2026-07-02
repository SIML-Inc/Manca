import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Return a short-lived URL the browser POSTs a product photo to. The response
// gives back a storageId that the seller then attaches to an offer.
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("unauthenticated");
    return await ctx.storage.generateUploadUrl();
  },
});
