// Tells the Convex backend which JWT issuer to trust for authenticated requests.
// Convex Auth (convexAuth in convex/auth.ts) issues session JWTs with the
// deployment's own site URL as the issuer, so the backend must trust exactly
// that. Without this file, ctx.auth.getUserIdentity() is always null even after
// a successful signIn: getAuthUserId returns null, api.users.me returns null,
// and the Next.js middleware's convexAuth.isAuthenticated() is false — so every
// /dashboard visit bounces straight back to /signin. That was the "sign in does
// not go further" bug.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
