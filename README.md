# Manca

**The missing trust layer for agent‑to‑agent commerce.**

Manca is a neutral **clearinghouse** where any agent can *both buy and sell* — one connection, both sides. It doesn't try to own the connection standard (AP2/UCP/x402 already did that, for free). It owns the layer those protocols deliberately refuse to touch: **who do you trust, who holds the money in flight, and who eats the loss when an autonomous deal fails with no human present.**

That layer is escrow + machine‑verifiable fulfillment + a reputation graph + risk underwriting — and it's **profitable from the first cleared trade**, without a single transaction toll.

> *Manca* — Italian/Spanish for *"it's missing."* This is the missing piece.

---

## Why this exists

Three rounds of multi‑model research (7 frontier models — Opus 4.8, Gemini 3.1 Pro, GPT‑5.5, GLM‑5.2, Kimi K2, Grok 4.3, DeepSeek V4) converged on one conclusion:

- The **connection** standards for agent commerce already shipped and are free public infrastructure (Google AP2 → FIDO, Shopify/Google UCP, OpenAI/Stripe ACP, Coinbase x402).
- The **transaction‑fee** model is dead (OpenAI's 4% ACP fee was rolled back within weeks; Perplexity went zero‑fee and won).
- What is **still unowned** is *trust + clearing + risk* — the "absence of a human to blame" in autonomous, human‑not‑present commerce.

Manca is a reference implementation of that layer. It **consumes** AP2/UCP/x402; it does not rebuild them.

---

## The core idea in one picture

```
   ANY buyer agent                                   ANY seller agent
        │  signed buy mandate                             │  signed sell offer
        ▼                                                 ▼
   ┌────────────────────────────────────────────────────────┐
   │                     MANCA CLEARINGHOUSE                  │
   │  match  →  escrow (float)  →  machine‑verify  →  settle  │
   │                      reputation graph  ◄── the moat      │
   └────────────────────────────────────────────────────────┘
   revenue: clearing fee · float yield · savings share · insurance · verified‑supply
```

**Symmetric by construction:** every account has both payables and receivables, and is both *rated* and *rating*. The same object buys and sells. That's how one connection gives an agent both sides.

**Machine‑verifiable settlement:** a buy mandate carries a verification rule (`json_schema`, `hash_match`, `value_threshold`, `http_ok`, or `manual`). Funds only release when the delivered payload provably satisfies it — so digital A2A trades settle autonomously, and physical/subjective ones (`manual`) are flagged for human attestation instead of silently auto‑settling.

---

## Try it in 10 seconds (no clone, no install)

```bash
npx -y github:SIML-Inc/Manca demo     # watch agents trade A2A + money accrue
```

Add it to any MCP client (Claude Desktop, Cursor, …):

```json
{ "mcpServers": { "manca": { "command": "npx", "args": ["-y", "github:SIML-Inc/Manca", "mcp"] } } }
```

## Quickstart from source (zero dependencies, Node ≥ 22.6)

```bash
git clone https://github.com/SIML-Inc/Manca && cd Manca
npm test               # 12 passing tests — the clearing + x402 mechanism, proven
npm run demo           # A2A trade demo with live P&L and x402 settlement
MANCA_SEED=1 npm run serve   # live dashboard at http://localhost:8787
```

`npm run demo` output ends with a live P&L:

```
verified_supply_subscription   $297.0000
clearing_fee                   $0.8000
savings_share                  $6.0000
insurance_premium              $2.9830
TOTAL NETWORK REVENUE          $306.7830
```

Nothing to install — Manca runs TypeScript natively on Node 23 and has **no runtime dependencies**.

---

## Connect any agent (MCP — one config)

```bash
npm run mcp     # starts the Manca MCP server on stdio
```

Add it to any MCP client (Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "manca": {
      "command": "node",
      "args": ["--experimental-strip-types", "/absolute/path/to/Manca/src/cli.ts", "mcp"]
    }
  }
}
```

Now any agent has 10 tools — `manca_open_account`, `manca_deposit`, `manca_sell`, `manca_buy`, `manca_match`, `manca_fulfill`, `manca_revenue`, … — and can buy *and* sell. Signing is **custodial** (Manca manages the account key), so the agent needs zero crypto plumbing. That's the one‑liner distribution.

Prefer HTTP? `npm run serve` exposes the same operations as a REST API on `:8787`.

---

## Use it from code (the SDK)

```ts
import { Store } from "./src/core/store.ts";
import { Clearinghouse } from "./src/core/clearinghouse.ts";
import { loadConfig } from "./src/core/config.ts";
import { Agent } from "./src/agent.ts";

const hub = new Clearinghouse(new Store(), loadConfig());

const buyer  = new Agent(hub, "buyer").deposit(100);
const seller = new Agent(hub, "seller").becomeVerifiedSupplier();

seller.sell({ category: "web-scrape", attributes: { rows: 5000 }, price: 40, slaSeconds: 60, available: 1 });

const mandate = buyer.buy({
  category: "web-scrape", spec: { rows: 5000 }, maxPrice: 50, minReputation: 0,
  referencePrice: 60, insured: true,
  verification: { type: "value_threshold", field: "rows", min: 5000 },
  deadline: Date.now() + 60_000,
});

const trade = hub.match(mandate.id);          // escrow locked, authority checked
await seller.fulfill(trade.id, { rows: 5200 }); // machine‑verified → auto‑settled

console.log(hub.revenueReport());              // the network already made money
```

---

## Monetization (profitable on day one, no toll)

| Stream | Mechanism | Config key |
|---|---|---|
| **Clearing + guarantee fee** | bps on cleared value — priced for *risk removal*, not access | `clearing.clearingFeeBps` |
| **Float yield** | interest on funds held in escrow while in flight (the Circle/Adyen mechanic) | `float.floatApyBps` |
| **Savings share** | a cut of realized savings vs the buyer's reference price — you only earn when the buyer wins | `savingsShare.savingsShareBps` |
| **Fulfillment insurance** | risk‑priced premium; pays the buyer from a pool on failure; premium earned on success | `insurance.premiumBps` |
| **Verified supply** | recurring subscription for eligible, discoverable sellers | `verifiedSupply.subscriptionMonthlyUsd` |

Every stream is turned on and priced in [`manca.config.json`](./manca.config.json). See [docs/MONETIZATION.md](./docs/MONETIZATION.md).

---

## Unique network identity (not a template)

Every Manca deployment has its **own cryptographic identity**. This repo ships one already generated (`network.id = manca_b0909cbe45c53332`). To mint your own:

```bash
npm run init     # writes .manca/network.json (private key, gitignored)
```

The private key never leaves `.manca/` (gitignored); only the public network id + config are shared.

---

## Layout

```
src/core/        clearinghouse, escrow, fulfillment, reputation, revenue, crypto, store
src/server/      http.ts (REST) · mcp.ts (MCP over stdio)
src/agent.ts     the buyer+seller SDK
src/demo.ts      end‑to‑end A2A settlement demo
test/            node:test suite (8 tests)
docs/            ARCHITECTURE.md · MONETIZATION.md
manca.config.json  this network's unique config + fee schedule
```

## Status

Reference MVP: full clearing mechanism, escrow, machine‑verified settlement, reputation, revenue engine, MCP + HTTP surfaces, tests. In‑memory/JSON persistence is swappable for Postgres/Supabase without touching the clearing logic. Settlement is modeled; wiring to live rails (x402/USDC, AP2 mandates) is the next step.

MIT licensed.
