// Zero-dependency HTTP API over the clearinghouse (node:http). Mirrors every
// core operation so non-MCP agents / dashboards can integrate.
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Store } from "../core/store.ts";
import { Clearinghouse, MancaError } from "../core/clearinghouse.ts";
import { loadConfig } from "../core/config.ts";
import { Agent } from "../agent.ts";
import { dashboardHtml } from "./dashboard.ts";

// Seed a little live activity so the dashboard isn't empty on first open.
async function seed(hub: Clearinghouse) {
  const acme = new Agent(hub, "ACME procurement").deposit(5000);
  const scrape = new Agent(hub, "ScrapeFarm").becomeVerifiedSupplier();
  const gpu = new Agent(hub, "NimbusGPU").becomeVerifiedSupplier();
  const flaky = new Agent(hub, "FlakyData").becomeVerifiedSupplier();
  scrape.sell({ category: "web-scrape", attributes: { rows: 5000 }, price: 40, slaSeconds: 30, available: 5 });
  gpu.sell({ category: "compute", attributes: { gpu: "h100" }, price: 120, slaSeconds: 30, available: 3 });
  flaky.sell({ category: "data-enrichment", attributes: {}, price: 25, slaSeconds: 30, available: 2 });

  let m = acme.buy({ category: "web-scrape", spec: {}, maxPrice: 50, minReputation: 0, referencePrice: 60, insured: false, verification: { type: "value_threshold", field: "rows", min: 5000 }, deadline: Date.now() + 60000 });
  await scrape.fulfill(hub.match(m.id).id, { rows: 5200 });
  m = acme.buy({ category: "compute", spec: {}, maxPrice: 150, minReputation: 0, referencePrice: 140, insured: true, verification: { type: "json_schema", requires: { done: true } }, deadline: Date.now() + 60000 });
  await gpu.fulfill(hub.match(m.id).id, { done: true });
  m = acme.buy({ category: "data-enrichment", spec: {}, maxPrice: 30, minReputation: 0, insured: true, verification: { type: "json_schema", requires: { delivered: true } }, deadline: Date.now() - 1 });
  hub.match(m.id);
  hub.expire(Date.now());
}

export async function startHttp(port = 8787, dataPath: string | null = "data/manca.json") {
  const cfg = loadConfig();
  const store = new Store(dataPath);
  const hub = new Clearinghouse(store, cfg);
  if (process.env.MANCA_SEED === "1" && store.accounts.size === 0) await seed(hub);

  const CATS = ["web-scrape", "compute", "data-enrichment", "llm-eval", "translation", "image-gen"];
  // One-click trade for the dashboard buttons: runs a full flow server-side
  // (custodial signing) so the browser needs no keys.
  async function simulateTrade(kind: "settle" | "insured" | "fail") {
    const n = store.accounts.size;
    const cat = CATS[n % CATS.length];
    const price = 20 + ((n * 37) % 180);
    const buyer = new Agent(hub, `buyer-${n}`).deposit(price * 3);
    const seller = new Agent(hub, `seller-${n}`).becomeVerifiedSupplier();
    seller.sell({ category: cat, attributes: {}, price, slaSeconds: 60, available: 1 });
    const insured = kind === "insured";
    const fail = kind === "fail";
    const mandate = buyer.buy({
      category: cat, spec: {}, maxPrice: price + 50, minReputation: 0, referencePrice: price + 40,
      insured, verification: { type: "json_schema", requires: { ok: true } },
      deadline: fail ? Date.now() - 1 : Date.now() + 60_000,
    });
    if (fail) { hub.match(mandate.id); hub.expire(); return { category: cat, price, result: "failed" }; }
    const trade = hub.match(mandate.id);
    const r = await seller.fulfill(trade.id, { ok: true });
    return { category: cat, price, insured, result: r.verdict.verified ? "settled" : "rejected" };
  }

  const state = () => {
    const accounts = [...store.accounts.values()].map((a) => hub.accountView(a.id));
    const trades = [...store.trades.values()].map((t) => ({
      id: t.id,
      category: store.mandates.get(t.mandateId)?.category ?? "?",
      buyer: store.accounts.get(t.buyerId)?.label ?? t.buyerId,
      seller: store.accounts.get(t.sellerId)?.label ?? t.sellerId,
      price: t.price,
      insured: t.insured,
      status: t.status,
    }));
    return { network: cfg.network, revenue: hub.revenueReport(), accounts, trades };
  };

  const json = (res: ServerResponse, code: number, body: unknown) => {
    const s = JSON.stringify(body, null, 2);
    res.writeHead(code, { "content-type": "application/json" });
    res.end(s);
  };
  const readBody = (req: IncomingMessage): Promise<any> =>
    new Promise((resolve) => {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => resolve(b ? JSON.parse(b) : {}));
    });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      const parts = url.pathname.split("/").filter(Boolean);
      const m = req.method ?? "GET";

      if (m === "GET" && parts.length === 0) {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(dashboardHtml(cfg.network.name, cfg.network.id));
      }
      if (m === "GET" && parts[0] === "state") return json(res, 200, state());
      if (m === "GET" && parts[0] === "health")
        return json(res, 200, { ok: true, network: cfg.network.id, name: cfg.network.name });
      if (m === "GET" && parts[0] === "revenue")
        return json(res, 200, hub.revenueReport());
      if (m === "GET" && parts[0] === "accounts" && parts[1])
        return json(res, 200, hub.accountView(parts[1]));

      if (m === "POST") {
        const body = await readBody(req);
        if (parts[0] === "simulate")
          return json(res, 200, await simulateTrade((body.kind ?? "settle")));
        if (parts[0] === "accounts" && parts.length === 1)
          return json(res, 201, hub.register(body.label, body.publicKey));
        if (parts[0] === "accounts" && parts[2] === "deposit")
          return json(res, 200, hub.deposit(parts[1], body.amount));
        if (parts[0] === "accounts" && parts[2] === "verify")
          return json(res, 200, hub.enableVerifiedSupplier(parts[1]));
        if (parts[0] === "mandates")
          return json(res, 201, hub.postBuyMandate(body, body.signature));
        if (parts[0] === "offers")
          return json(res, 201, hub.postSellOffer(body, body.signature));
        if (parts[0] === "match")
          return json(res, 200, hub.match(body.mandateId));
        if (parts[0] === "fulfill")
          return json(res, 200, await hub.submitFulfillment(body.tradeId, body.payload));
        if (parts[0] === "expire")
          return json(res, 200, { failed: hub.expire() });
      }
      json(res, 404, { error: "not found" });
    } catch (e) {
      const code = e instanceof MancaError ? 400 : 500;
      json(res, code, { error: (e as Error).message });
    } finally {
      store.persist();
    }
  });

  server.listen(port, () => {
    console.log(`Manca HTTP API on http://localhost:${port}  (network ${cfg.network.id})`);
  });
  return server;
}
