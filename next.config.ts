import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The zero-dependency SDK under src/ and the Node test suite are not part of
  // the Next build; the app lives in app/ and the backend in convex/.
  typescript: {
    // Type-checking is run separately via `npm run typecheck` (app + sdk).
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
