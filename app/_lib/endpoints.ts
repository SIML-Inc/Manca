// The public HTTP surface (REST + MCP) is served from the Convex ".site" origin.
export const API_BASE =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  (process.env.NEXT_PUBLIC_CONVEX_URL ?? "").replace(".convex.cloud", ".convex.site");

export const MCP_URL = `${API_BASE}/mcp`;
export const REST_BASE = `${API_BASE}/v1`;
