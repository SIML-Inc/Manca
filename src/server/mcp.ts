// Zero-dependency MCP server (JSON-RPC 2.0 over stdio, newline-delimited).
// This is the "one connection" primitive: an agent adds ONE config and can then
// both buy and sell on Manca. Signing is custodial (Manca manages the account
// key) so the agent needs no crypto plumbing — the trybounty-style one-liner.
import { createInterface } from "node:readline";
import { Store } from "../core/store.ts";
import { Clearinghouse } from "../core/clearinghouse.ts";
import { loadConfig } from "../core/config.ts";
import { Agent } from "../agent.ts";

interface RpcReq { jsonrpc: "2.0"; id?: number | string | null; method: string; params?: any }

const PROTOCOL_VERSION = "2025-06-18";

// MCP is custodial (Manca holds the session's account keys in memory), so state
// is session-scoped for the life of the connection — the standard, honest model
// for a stdio MCP server. The HTTP surface is the durable, external-key path.
export async function startMcp(dataPath: string | null = null) {
  const cfg = loadConfig();
  const store = new Store(dataPath);
  const hub = new Clearinghouse(store, cfg);
  await hub.useConfiguredRail();
  // custodial agents keyed by a caller-chosen handle
  const agents = new Map<string, Agent>();
  const agentFor = (handle: string): Agent => {
    let a = agents.get(handle);
    if (!a) {
      a = new Agent(hub, handle);
      agents.set(handle, a);
    }
    return a;
  };

  const tools = [
    { name: "manca_whoami", description: "Get this network's id, settlement asset, and fee schedule.", inputSchema: { type: "object", properties: {} } },
    { name: "manca_open_account", description: "Open (or fetch) your symmetric clearing account. Returns your agent handle, balance, reputation, and autonomous spend limit.", inputSchema: { type: "object", properties: { handle: { type: "string", description: "a stable name for your agent" } }, required: ["handle"] } },
    { name: "manca_deposit", description: "Add settlement balance to your account (demo/testnet credit).", inputSchema: { type: "object", properties: { handle: { type: "string" }, amount: { type: "number" } }, required: ["handle", "amount"] } },
    { name: "manca_become_supplier", description: "Enable verified-supplier status so you can post sell offers.", inputSchema: { type: "object", properties: { handle: { type: "string" } }, required: ["handle"] } },
    { name: "manca_sell", description: "Post a machine-committable sell offer.", inputSchema: { type: "object", properties: { handle: { type: "string" }, category: { type: "string" }, price: { type: "number" }, slaSeconds: { type: "number" }, available: { type: "number" }, attributes: { type: "object" } }, required: ["handle", "category", "price"] } },
    { name: "manca_buy", description: "Post a buy mandate. Manca matches, escrows funds, and settles automatically when the seller's delivery satisfies your verification rule.", inputSchema: { type: "object", properties: { handle: { type: "string" }, category: { type: "string" }, maxPrice: { type: "number" }, minReputation: { type: "number" }, referencePrice: { type: "number" }, insured: { type: "boolean" }, deadlineSeconds: { type: "number" }, verification: { type: "object", description: "e.g. {type:'value_threshold',field:'rows',min:1000} or {type:'json_schema',requires:{ok:true}}" }, spec: { type: "object" } }, required: ["handle", "category", "maxPrice", "verification"] } },
    { name: "manca_match", description: "Match a buy mandate to the best eligible sell offer and lock escrow. Returns the trade.", inputSchema: { type: "object", properties: { mandateId: { type: "string" } }, required: ["mandateId"] } },
    { name: "manca_fulfill", description: "Deliver against a trade; Manca machine-verifies and auto-settles if it passes.", inputSchema: { type: "object", properties: { handle: { type: "string" }, tradeId: { type: "string" }, payload: {} }, required: ["handle", "tradeId", "payload"] } },
    { name: "manca_account", description: "Fetch an account view by handle.", inputSchema: { type: "object", properties: { handle: { type: "string" } }, required: ["handle"] } },
    { name: "manca_revenue", description: "Network P&L: clearing fees, float, savings share, insurance, subscriptions.", inputSchema: { type: "object", properties: {} } },
  ];

  async function callTool(name: string, args: any): Promise<unknown> {
    switch (name) {
      case "manca_whoami":
        return { network: cfg.network, clearing: cfg.clearing, float: cfg.float, insurance: cfg.insurance, settlement: hub.rail.status() };
      case "manca_open_account":
        return agentFor(args.handle).view();
      case "manca_deposit":
        return agentFor(args.handle).deposit(args.amount).view();
      case "manca_become_supplier":
        return agentFor(args.handle).becomeVerifiedSupplier().view();
      case "manca_sell":
        return agentFor(args.handle).sell({
          category: args.category, attributes: args.attributes ?? {}, price: args.price,
          slaSeconds: args.slaSeconds ?? 60, available: args.available ?? 1,
        });
      case "manca_buy":
        return agentFor(args.handle).buy({
          category: args.category, spec: args.spec ?? {}, maxPrice: args.maxPrice,
          minReputation: args.minReputation ?? 0, referencePrice: args.referencePrice,
          insured: args.insured ?? false, verification: args.verification,
          deadline: Date.now() + (args.deadlineSeconds ?? 3600) * 1000,
        });
      case "manca_match":
        return hub.match(args.mandateId);
      case "manca_fulfill":
        return await agentFor(args.handle).fulfill(args.tradeId, args.payload);
      case "manca_account":
        return agentFor(args.handle).view();
      case "manca_revenue":
        return hub.revenueReport();
      default:
        throw new Error(`unknown tool ${name}`);
    }
  }

  const send = (msg: unknown) => process.stdout.write(JSON.stringify(msg) + "\n");
  const rl = createInterface({ input: process.stdin });

  rl.on("line", async (line) => {
    const text = line.trim();
    if (!text) return;
    let req: RpcReq;
    try { req = JSON.parse(text); } catch { return; }
    const reply = (result: unknown) => send({ jsonrpc: "2.0", id: req.id, result });
    const fail = (message: string) => send({ jsonrpc: "2.0", id: req.id, error: { code: -32000, message } });

    try {
      if (req.method === "initialize") {
        return reply({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "manca", version: "0.1.0" },
        });
      }
      if (req.method === "notifications/initialized" || req.method === "notifications/cancelled") return;
      if (req.method === "ping") return reply({});
      if (req.method === "tools/list") return reply({ tools });
      if (req.method === "tools/call") {
        const out = await callTool(req.params?.name, req.params?.arguments ?? {});
        return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      }
      if (req.id !== undefined && req.id !== null) fail(`method not found: ${req.method}`);
    } catch (e) {
      // surface as tool error content so the agent sees it
      if (req.method === "tools/call")
        return reply({ content: [{ type: "text", text: `error: ${(e as Error).message}` }], isError: true });
      fail((e as Error).message);
    }
  });

  process.stderr.write(`Manca MCP server ready on stdio (network ${cfg.network.id})\n`);
}
