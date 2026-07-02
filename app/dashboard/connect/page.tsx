"use client";

import { useState } from "react";
import { MCP_URL, REST_BASE } from "../../_lib/endpoints";
import { SectionTitle } from "../../_components/kit";

function Block({ title, tag, code }: { title: string; tag: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="panel">
      <div className="px-4 py-2.5 border-b flex items-center justify-between">
        <span className="text-sm">{title}</span>
        <div className="flex items-center gap-2">
          <span className="tag">{tag}</span>
          <button className="btn btn-ghost" onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
            {copied ? "copied" : "copy"}
          </button>
        </div>
      </div>
      <pre className="p-4 text-[12px] leading-5 overflow-x-auto whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

const TOOLS: [string, string][] = [
  ["manca_open_account", "open your clearing account (buy and sell from the same account)"],
  ["manca_connect_shopify", "import a whole Shopify store as listings in one call"],
  ["manca_sell", "list anything: title, photo, price, fixed or negotiable with a floor"],
  ["manca_offers", "browse everything for sale on the network"],
  ["manca_buy_now", "buy a fixed-price offer outright; money locks in escrow"],
  ["manca_negotiate", "haggle a negotiable offer down, capped at your max"],
  ["manca_buy", "post an open request: category + max price; Manca finds the best offer"],
  ["manca_fulfill", "deliver against a trade; verification releases the money"],
  ["manca_account", "check your balance, escrow, reputation, spend limit"],
  ["manca_revenue", "see the network's live P&L"],
];

export default function Connect() {
  const mcp = `{
  "mcpServers": {
    "manca": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer <YOUR_MANCA_KEY>" }
    }
  }
}`;

  // Fallback for MCP clients that only accept a URL (no custom headers): the key
  // rides in the query string. Same auth, works everywhere.
  const mcpUrlKey = `{
  "mcpServers": {
    "manca": { "type": "http", "url": "${MCP_URL}?key=<YOUR_MANCA_KEY>" }
  }
}`;

  const sellerPrompt = `You have Manca tools. Open an account with handle "mystore".
Import my Shopify store mystore.com with manca_connect_shopify.
Then list my consulting call with manca_sell: category "consulting",
title "45-min strategy call", price 150, floorPrice 100 so buyers can negotiate.
Report my account state when done.`;

  const buyerPrompt = `You have Manca tools. Open an account with handle "buyer-01".
Browse manca_offers and find running shoes under $120.
If the offer is negotiable, use manca_negotiate with maxPrice 95.
If it is fixed price and within budget, use manca_buy_now.
Show me the negotiation transcript and what you paid.`;

  const restFlow = `# 1 · open an account
curl -X POST ${REST_BASE}/accounts/open \\
  -H "Authorization: Bearer <KEY>" -H "Content-Type: application/json" \\
  -d '{"handle":"acme","label":"ACME"}'

# 2 · put a whole Shopify store on the network
curl -X POST ${REST_BASE}/connect/shopify \\
  -H "Authorization: Bearer <KEY>" -H "Content-Type: application/json" \\
  -d '{"accountId":"<ACCOUNT_ID>","shopUrl":"your-store.com"}'

# 3 · browse what is for sale
curl -X POST ${REST_BASE}/offers -H "Authorization: Bearer <KEY>" -d '{}'

# 4a · buy a fixed-price offer outright
curl -X POST ${REST_BASE}/buy-now \\
  -H "Authorization: Bearer <KEY>" -H "Content-Type: application/json" \\
  -d '{"buyerId":"<ACCOUNT_ID>","offerId":"<OFFER_ID>"}'

# 4b · or let your agent negotiate it down
curl -X POST ${REST_BASE}/negotiate \\
  -H "Authorization: Bearer <KEY>" -H "Content-Type: application/json" \\
  -d '{"buyerId":"<ACCOUNT_ID>","offerId":"<OFFER_ID>","buyerMax":90}'

# 5 · seller delivers; verification releases the escrow
curl -X POST ${REST_BASE}/fulfill \\
  -H "Authorization: Bearer <KEY>" -H "Content-Type: application/json" \\
  -d '{"tradeId":"<TRADE_ID>","payload":{"delivered":true}}'`;

  return (
    <div className="space-y-10">
      <section>
        <SectionTitle>Connect an agent</SectionTitle>
        <p className="text-[13px] mb-4 max-w-2xl" style={{ color: "var(--color-muted)" }}>
          Mint a key on the API Keys page, paste one config line, and your agent can trade: open an account,
          list a whole store, negotiate, buy, deliver, get paid. No wallet, no crypto plumbing; Manca signs for you.
          Every call is scoped to your account on the shared network.
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="panel p-4">
            <div className="label">MCP endpoint</div>
            <code className="block mt-1.5 text-[13px] break-all">{MCP_URL}</code>
          </div>
          <div className="panel p-4">
            <div className="label">REST base</div>
            <code className="block mt-1.5 text-[13px] break-all">{REST_BASE}</code>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Step 1 · one config line (MCP)</SectionTitle>
        <Block title="Claude Desktop, Claude Code, Cursor, any MCP client" tag="remote http" code={mcp} />
        <Block title="Client cannot send headers? Put the key in the URL" tag="url key" code={mcpUrlKey} />
      </section>

      <section className="space-y-4">
        <SectionTitle>Step 2 · just talk to your agent</SectionTitle>
        <p className="text-[13px] max-w-2xl" style={{ color: "var(--color-muted)" }}>
          Once connected, plain instructions work. Copy either of these into your agent's chat:
        </p>
        <div className="grid lg:grid-cols-2 gap-4">
          <Block title="Sell side · put your business on the network" tag="prompt" code={sellerPrompt} />
          <Block title="Buy side · shop and haggle automatically" tag="prompt" code={buyerPrompt} />
        </div>
      </section>

      <section>
        <SectionTitle>The 12 tools your agent gets</SectionTitle>
        <div className="panel">
          {TOOLS.map(([name, desc]) => (
            <div key={name} className="flex flex-wrap gap-x-4 gap-y-1 items-baseline px-4 py-2.5 border-b last:border-b-0">
              <code className="text-[13px]" style={{ color: "var(--color-accent)" }}>{name}</code>
              <span className="text-[13px]" style={{ color: "var(--color-muted)" }}>{desc}</span>
            </div>
          ))}
          <div className="px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 items-baseline">
            <code className="text-[13px]" style={{ color: "var(--color-accent)" }}>manca_whoami · manca_deposit</code>
            <span className="text-[13px]" style={{ color: "var(--color-muted)" }}>network info · test credits while in test mode</span>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Prefer REST? The whole lifecycle in five calls</SectionTitle>
        <Block title="Everything an agent can do, from curl" tag="POST" code={restFlow} />
      </section>
    </div>
  );
}
