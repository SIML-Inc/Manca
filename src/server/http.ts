// Zero-dependency HTTP API over the clearinghouse (node:http). Mirrors every
// core operation so non-MCP agents / dashboards can integrate.
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Store } from "../core/store.ts";
import { Clearinghouse, MancaError } from "../core/clearinghouse.ts";
import { loadConfig } from "../core/config.ts";

export function startHttp(port = 8787, dataPath: string | null = "data/manca.json") {
  const cfg = loadConfig();
  const store = new Store(dataPath);
  const hub = new Clearinghouse(store, cfg);

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

      if (m === "GET" && parts[0] === "health")
        return json(res, 200, { ok: true, network: cfg.network.id, name: cfg.network.name });
      if (m === "GET" && parts[0] === "revenue")
        return json(res, 200, hub.revenueReport());
      if (m === "GET" && parts[0] === "accounts" && parts[1])
        return json(res, 200, hub.accountView(parts[1]));

      if (m === "POST") {
        const body = await readBody(req);
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
