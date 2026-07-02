import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

// Convex Auth routes (/api/auth/*) — powers the dashboard session + OAuth.
auth.addHttpRoutes(http);

// ---------- helpers ----------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Authenticate an incoming request and return the owning userId, or null.
// The key can arrive two ways:
//   • Authorization: Bearer mk_live_...   (preferred; used by the REST API)
//   • ?key=mk_live_... in the URL          (for MCP clients that only accept a
//     URL and cannot attach a custom Authorization header)
async function authUser(ctx: any, req: Request): Promise<Id<"users"> | null> {
  const header = req.headers.get("Authorization") ?? "";
  let key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key) {
    const params = new URL(req.url).searchParams;
    key = (params.get("key") ?? params.get("apiKey") ?? params.get("api_key") ?? "").trim();
  }
  if (!key) return null;
  const found = await ctx.runQuery(internal.apiKeys.verify, { key });
  if (!found) return null;
  await ctx.runMutation(internal.apiKeys.touch, { keyId: found.keyId });
  return found.userId as Id<"users">;
}

// Resolve (get-or-create) an account id for this user's handle.
async function accountIdForHandle(ctx: any, userId: Id<"users">, handle: string): Promise<Id<"accounts">> {
  const view = await ctx.runMutation(internal.accounts.openInternal, { userId, handle, label: handle });
  return view.id as Id<"accounts">;
}

// ---------- health + CORS preflight ----------
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const who = await ctx.runQuery(api.revenue.whoami, {});
    return json({ ok: true, network: who.network, settlement: who.settlement });
  }),
});
for (const pathPrefix of ["/v1/", "/mcp"]) {
  http.route({
    ...(pathPrefix === "/mcp" ? { path: "/mcp" } : { pathPrefix }),
    method: "OPTIONS",
    handler: httpAction(async () => new Response(null, { status: 204, headers: CORS })),
  });
}

// ---------- REST API (Bearer key) ----------
http.route({
  pathPrefix: "/v1/",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const userId = await authUser(ctx, req);
    if (!userId) return json({ error: "unauthorized — send Authorization: Bearer <api key>" }, 401);
    const path = new URL(req.url).pathname.replace(/^\/v1\//, "");
    const body = await req.json().catch(() => ({}));
    try {
      switch (path) {
        case "whoami":
          return json(await ctx.runQuery(api.revenue.whoami, {}));
        case "revenue":
          return json(await ctx.runQuery(api.revenue.report, {}));
        case "accounts/list":
          return json(await ctx.runQuery(internal.accounts.listForUser, { userId }));
        case "accounts/open":
          return json(await ctx.runMutation(internal.accounts.openInternal, {
            userId, label: body.label ?? body.handle, handle: body.handle, payoutAddress: body.payoutAddress,
          }));
        case "accounts/deposit":
          return json(await ctx.runMutation(internal.accounts.depositInternal, {
            userId, accountId: body.accountId, amount: body.amount,
          }));
        case "accounts/become-supplier":
          return json(await ctx.runMutation(internal.accounts.becomeSupplierInternal, {
            userId, accountId: body.accountId,
          }));
        case "sell":
          return json(await ctx.runMutation(internal.market.sellInternal, { userId, ...body }));
        case "buy":
          return json(await ctx.runMutation(internal.market.buyInternal, { userId, ...body }));
        case "offers":
          return json(await ctx.runQuery(api.market.offers, {}));
        case "buy-now":
          return json(await ctx.runMutation(internal.market.buyNowInternal, {
            userId, buyerId: body.buyerId, offerId: body.offerId, insured: body.insured, verification: body.verification,
          }));
        case "match":
          return json(await ctx.runMutation(internal.market.matchInternal, { userId, mandateId: body.mandateId }));
        case "negotiate":
          return json(await ctx.runAction(internal.negotiate.run, {
            userId, buyerId: body.buyerId, offerId: body.offerId, buyerMax: body.buyerMax,
            execute: body.execute, insured: body.insured, verification: body.verification,
          }));
        case "fulfill":
          return json(await ctx.runAction(internal.market.fulfillProbe, {
            userId, tradeId: body.tradeId, payload: body.payload,
          }));
        case "connect/shopify":
          return json(await ctx.runAction(internal.connectors.connectShopifyInternal, {
            userId, accountId: body.accountId, shopUrl: body.shopUrl,
          }));
        default:
          return json({ error: `unknown endpoint /v1/${path}` }, 404);
      }
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }),
});

// ---------- Remote MCP endpoint (Streamable HTTP, stateless JSON) ----------
const PROTOCOL_VERSION = "2025-06-18";

const MCP_TOOLS = [
  { name: "manca_whoami", description: "Get this network's id, settlement asset, and fee schedule.", inputSchema: { type: "object", properties: {} } },
  { name: "manca_open_account", description: "Open (or fetch) your symmetric clearing account by a stable handle. Returns balance, reputation, and autonomous spend limit.", inputSchema: { type: "object", properties: { handle: { type: "string" } }, required: ["handle"] } },
  { name: "manca_deposit", description: "Add settlement balance to your account (testnet/demo credit).", inputSchema: { type: "object", properties: { handle: { type: "string" }, amount: { type: "number" } }, required: ["handle", "amount"] } },
  { name: "manca_become_supplier", description: "Enable verified-supplier status so you can post sell offers.", inputSchema: { type: "object", properties: { handle: { type: "string" } }, required: ["handle"] } },
  { name: "manca_sell", description: "List something for sale: a product, a dataset, an API call, anything with a price. Set floorPrice to let buyer agents negotiate down to it; omit it for a fixed price.", inputSchema: { type: "object", properties: { handle: { type: "string" }, category: { type: "string" }, price: { type: "number" }, title: { type: "string" }, description: { type: "string" }, imageUrl: { type: "string" }, floorPrice: { type: "number", description: "lowest acceptable price; enables negotiation" }, slaSeconds: { type: "number" }, available: { type: "number" }, attributes: { type: "object" } }, required: ["handle", "category", "price"] } },
  { name: "manca_buy", description: "Ask the network to buy something for you: state a category and your max price. Manca finds the best offer, locks your money in escrow, and only pays the seller when delivery passes your verification rule (defaults to manual approval).", inputSchema: { type: "object", properties: { handle: { type: "string" }, category: { type: "string" }, maxPrice: { type: "number" }, minReputation: { type: "number" }, referencePrice: { type: "number" }, insured: { type: "boolean" }, deadlineSeconds: { type: "number" }, verification: { type: "object", description: "optional; e.g. {type:'value_threshold',field:'rows',min:1000} or {type:'json_schema',requires:{ok:true}}; defaults to {type:'manual'}" }, spec: { type: "object" } }, required: ["handle", "category", "maxPrice"] } },
  { name: "manca_connect_shopify", description: "Import an entire Shopify store's live catalog as sell offers in one call. Pass the store URL (e.g. brand.com); every product becomes buyable on the network under your account.", inputSchema: { type: "object", properties: { handle: { type: "string" }, shopUrl: { type: "string" } }, required: ["handle", "shopUrl"] } },
  { name: "manca_offers", description: "Browse open sell offers on the network (id, title, category, price, whether the seller allows negotiation).", inputSchema: { type: "object", properties: {} } },
  { name: "manca_buy_now", description: "Buy a specific offer outright at its list price (fixed-price purchase, no negotiation). Locks a trade in escrow.", inputSchema: { type: "object", properties: { handle: { type: "string" }, offerId: { type: "string" }, insured: { type: "boolean" } }, required: ["handle", "offerId"] } },
  { name: "manca_match", description: "Match a buy mandate to the best eligible sell offer and lock escrow. Returns the trade.", inputSchema: { type: "object", properties: { mandateId: { type: "string" } }, required: ["mandateId"] } },
  { name: "manca_negotiate", description: "Have your buyer agent negotiate a lower price against a specific offer, up to your max. Two agents haggle within bounds; on agreement a trade locks at the negotiated price. Returns the transcript, agreed price, and trade.", inputSchema: { type: "object", properties: { handle: { type: "string" }, offerId: { type: "string" }, maxPrice: { type: "number" }, execute: { type: "boolean", description: "lock a trade at the agreed price (default true)" }, insured: { type: "boolean" } }, required: ["handle", "offerId", "maxPrice"] } },
  { name: "manca_fulfill", description: "Deliver against a trade; Manca machine-verifies and auto-settles if it passes.", inputSchema: { type: "object", properties: { tradeId: { type: "string" }, payload: {} }, required: ["tradeId", "payload"] } },
  { name: "manca_account", description: "Fetch your account view by handle.", inputSchema: { type: "object", properties: { handle: { type: "string" } }, required: ["handle"] } },
  { name: "manca_revenue", description: "Network P&L: clearing fees, float, savings share, insurance, subscriptions.", inputSchema: { type: "object", properties: {} } },
];

async function callMcpTool(ctx: any, userId: Id<"users">, name: string, args: any): Promise<unknown> {
  switch (name) {
    case "manca_whoami":
      return ctx.runQuery(api.revenue.whoami, {});
    case "manca_revenue":
      return ctx.runQuery(api.revenue.report, {});
    case "manca_open_account":
    case "manca_account":
      return ctx.runMutation(internal.accounts.openInternal, { userId, handle: args.handle, label: args.handle });
    case "manca_deposit": {
      const accountId = await accountIdForHandle(ctx, userId, args.handle);
      return ctx.runMutation(internal.accounts.depositInternal, { userId, accountId, amount: args.amount });
    }
    case "manca_become_supplier": {
      const accountId = await accountIdForHandle(ctx, userId, args.handle);
      return ctx.runMutation(internal.accounts.becomeSupplierInternal, { userId, accountId });
    }
    case "manca_sell": {
      const sellerId = await accountIdForHandle(ctx, userId, args.handle);
      return ctx.runMutation(internal.market.sellInternal, {
        userId, sellerId, category: args.category, attributes: args.attributes ?? {},
        price: args.price, slaSeconds: args.slaSeconds ?? 60, available: args.available ?? 1,
        title: args.title, description: args.description, imageUrl: args.imageUrl, floorPrice: args.floorPrice,
      });
    }
    case "manca_buy": {
      const buyerId = await accountIdForHandle(ctx, userId, args.handle);
      return ctx.runMutation(internal.market.buyInternal, {
        userId, buyerId, category: args.category, spec: args.spec ?? {}, maxPrice: args.maxPrice,
        minReputation: args.minReputation ?? 0, referencePrice: args.referencePrice,
        insured: args.insured ?? false, verification: args.verification ?? { type: "manual" },
        deadline: Date.now() + (args.deadlineSeconds ?? 3600) * 1000,
      });
    }
    case "manca_connect_shopify": {
      const accountId = await accountIdForHandle(ctx, userId, args.handle);
      return ctx.runAction(internal.connectors.connectShopifyInternal, { userId, accountId, shopUrl: args.shopUrl });
    }
    case "manca_offers":
      return ctx.runQuery(api.market.offers, {});
    case "manca_buy_now": {
      const buyerId = await accountIdForHandle(ctx, userId, args.handle);
      return ctx.runMutation(internal.market.buyNowInternal, { userId, buyerId, offerId: args.offerId, insured: args.insured });
    }
    case "manca_match":
      return ctx.runMutation(internal.market.matchInternal, { userId, mandateId: args.mandateId });
    case "manca_negotiate": {
      const buyerId = await accountIdForHandle(ctx, userId, args.handle);
      return ctx.runAction(internal.negotiate.run, {
        userId, buyerId, offerId: args.offerId, buyerMax: args.maxPrice,
        execute: args.execute, insured: args.insured,
      });
    }
    case "manca_fulfill":
      return ctx.runAction(internal.market.fulfillProbe, { userId, tradeId: args.tradeId, payload: args.payload });
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

http.route({
  path: "/mcp",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const userId = await authUser(ctx, req);
    const rpc = await req.json().catch(() => null);
    if (!rpc || rpc.jsonrpc !== "2.0") return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, 400);

    const reply = (result: unknown) => json({ jsonrpc: "2.0", id: rpc.id, result });
    const fail = (code: number, message: string) => json({ jsonrpc: "2.0", id: rpc.id, error: { code, message } });

    // Notifications get a 202 with no body.
    if (typeof rpc.method === "string" && rpc.method.startsWith("notifications/"))
      return new Response(null, { status: 202, headers: CORS });

    switch (rpc.method) {
      case "initialize":
        return reply({ protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: "manca", version: "0.1.0" } });
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: MCP_TOOLS });
      case "tools/call": {
        if (!userId) return fail(-32001, "unauthorized — send your Manca API key as 'Authorization: Bearer mk_live_...', or if your MCP client cannot send headers (e.g. Claude Desktop), append it to the URL: /mcp?key=mk_live_... — mint keys at trymanca.ai/dashboard/keys");
        try {
          const out = await callMcpTool(ctx, userId, rpc.params?.name, rpc.params?.arguments ?? {});
          return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
        } catch (e) {
          return reply({ content: [{ type: "text", text: `error: ${(e as Error).message}` }], isError: true });
        }
      }
      default:
        return fail(-32601, `method not found: ${rpc.method}`);
    }
  }),
});

// ---------- Stripe webhook ----------
// We never trust the webhook body. We take the session id from the event and
// re-fetch the session from Stripe with our secret key; only a session Stripe
// itself reports as paid credits a balance, and settleTopup is idempotent.
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return new Response("not configured", { status: 503 });
    const event = await req.json().catch(() => null);
    const type = event?.type as string | undefined;
    const sessionId = event?.data?.object?.id as string | undefined;
    if (!type?.startsWith("checkout.session.") || !sessionId) return new Response("ignored", { status: 200 });

    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return new Response("session not found", { status: 200 });
    const session = (await res.json()) as { payment_status?: string };
    const out = await ctx.runMutation(internal.billing.settleTopup, {
      stripeSessionId: sessionId,
      paid: session.payment_status === "paid",
    });
    return json(out);
  }),
});

// GET /mcp: this stateless endpoint has no server-initiated stream.
http.route({
  path: "/mcp",
  method: "GET",
  handler: httpAction(async () => new Response("Method Not Allowed", { status: 405, headers: CORS })),
});

export default http;
