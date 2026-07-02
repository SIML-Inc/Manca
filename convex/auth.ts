import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

// Email + password works out of the box. Google OAuth activates once
// AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are set on the deployment (callback URL:
// https://<deployment>.convex.site/api/auth/callback/google).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, Google],
});
