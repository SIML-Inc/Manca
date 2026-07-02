import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isDashboard = createRouteMatcher(["/dashboard(.*)"]);
const isSignIn = createRouteMatcher(["/signin"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const authed = await convexAuth.isAuthenticated();
  if (isDashboard(request) && !authed) {
    return nextjsMiddlewareRedirect(request, "/signin");
  }
  if (isSignIn(request) && authed) {
    return nextjsMiddlewareRedirect(request, "/dashboard");
  }
});

export const config = {
  // Run on everything except static assets and _next internals.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
