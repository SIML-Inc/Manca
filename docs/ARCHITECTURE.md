# Manca Architecture

Manca is a **bilateral clearing layer**. It sits *above* the free connection/payment
standards (AP2, UCP, x402) and provides the one thing they intentionally don't:
trust, escrow, machine‑verified settlement, and counterparty‑risk underwriting for
autonomous, human‑not‑present commerce.

## Modules

| File | Responsibility |
|---|---|
| `core/crypto.ts` | Ed25519 keys, canonical‑JSON signing/verification, ids, sha256 — zero‑dep (`node:crypto`) |
| `core/store.ts` | In‑memory maps + optional JSON snapshot. Swappable for Postgres/Supabase |
| `core/fulfillment.ts` | Machine‑verifiable rules: `json_schema`, `hash_match`, `value_threshold`, `http_ok`, `manual` |
| `core/reputation.ts` | Reputation updates, autonomous spend limits, risk‑priced insurance premium |
| `core/revenue.ts` | The monetization engine: clearing fee, float yield, savings share, insurance, subscriptions |
| `core/clearinghouse.ts` | Orchestrator: register → post → match → escrow → verify → settle / expire |
| `agent.ts` | Client SDK — one symmetric object that buys **and** sells |
| `server/http.ts` | REST surface (`node:http`) |
| `server/mcp.ts` | MCP surface over stdio (custodial signing = one‑config onboarding) |

## Settlement lifecycle

```
register + deposit
      │
buyer.buy(mandate, sig)        seller.sell(offer, sig)     ← both Ed25519‑signed
      │                               │
      └──────────── match() ──────────┘
                     │  authority gate (autonomous spend limit)
                     │  escrow lock (price + buyer fee); premium → insurance pool
                     ▼
             trade: "matched"
                     │
        seller.fulfill(tradeId, payload)
                     │  verifyFulfillment(rule, payload)
          ┌──────────┴───────────┐
     verified                 not verified
          │                        │
      settle()               stays matched (retry until deadline)
   • release escrow → seller        │
   • revenue: fee+float+savings     └── expire() after deadline →
   • insured premium earned             refund buyer + insurance payout
   • reputation ++ both sides           + seller reputation −−
          ▼
    trade: "settled"
```

## Why each design choice

- **Symmetric accounts.** A single account holds balance + escrow + reputation and can
  post both mandates and offers. Trust is bilateral, so the primitive must be too. This
  is what makes "one connection → buy and sell" literally true.
- **Machine‑verifiable fulfillment first.** Autonomous escrow is only safe where a
  computer can adjudicate delivery. Digital A2A (compute/data/APIs) is verifiable today;
  `manual` exists for physical goods but never auto‑settles — it demands a human attestation.
- **Escrow + float.** Funds are locked at match and released on verified delivery. Time‑
  value of money in flight is Manca revenue (the Circle/Adyen mechanic), not a toll.
- **Reputation as the moat.** Every settled/failed trade updates a cross‑counterparty
  score no single walled garden can see. It gates autonomous spend and prices insurance,
  and compounds with volume.
- **Authority gate.** `match()` refuses to move more than an agent's reputation‑derived
  autonomous spend limit without human approval — the "who authorized this, who's liable"
  question the research flagged as the real bottleneck.

## Swapping persistence / rails

`Store` is the only stateful boundary; replace it with a Postgres/Supabase adapter and the
clearing logic is untouched. Settlement is currently modeled on internal balances; wiring
`settle()`/`match()` to x402/USDC or AP2 payment mandates is a localized change in the
escrow release path.
