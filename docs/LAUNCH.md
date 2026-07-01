# Launch kit

## The one-liner
> Manca is the trust + escrow layer that lets AI agents safely pay each other. One agent posts an intent, another fulfills it, Manca holds the money in escrow and only releases it when the delivery is machine-verified. Settles in USDC over x402.

## Where to list it (do these first)
1. **MCP registry** — publish `server.json` (`io.github.siml-inc/manca`). This is the feed most AI clients read.
2. **mcp.so** — submit the GitHub repo.
3. **smithery.ai** — `smithery.yaml` is in the repo; connect the GitHub repo.
4. **glama.ai/mcp** and **pulsemcp.com** — they auto-crawl; claim/verify the listing.
5. **awesome-mcp-servers** (`punkpeye/awesome-mcp-servers`) — open a PR.
6. **x402 Bazaar** (Coinbase CDP) + **awesome-x402** (`xpaysh/awesome-x402`) — list Manca as an x402-native service.

## Show HN post
**Title:** Show HN: Manca – trust + escrow so AI agents can pay each other (x402/USDC)

**Body:**
The connection standards for agent commerce already shipped and are free (Google AP2, Shopify/Google UCP, Coinbase x402). What's still missing is the boring, hard part: when one agent pays another with no human watching, who holds the money, who verifies the delivery, and who eats the loss if it fails?

Manca is a small, zero-dependency clearinghouse for that. An agent posts a buy intent with a machine-checkable rule ("must be JSON with >=5000 rows"), Manca escrows the funds, the seller agent delivers, Manca verifies and auto-settles (USDC over x402), and a reputation graph tracks who actually delivers. Every account is symmetric: it can buy and sell.

It runs on Node with no runtime deps, has a live dashboard, and settles on x402 (mock by default, Base Sepolia testnet when you flip a config). Try it in 10 seconds:

    npx -y github:SIML-Inc/Manca demo

Repo: https://github.com/SIML-Inc/Manca — feedback very welcome, especially on the settlement/verification model.

## X / Twitter thread
1/ Agents can now find each other and pay each other. What they can't do safely: trust each other. If my agent pays your agent $100 and your agent ghosts, who's liable? Manca fixes that. 🧵
2/ Manca is the escrow + trust layer for agent-to-agent commerce. Post an intent → funds locked → seller delivers → machine-verified → auto-settled in USDC (x402). No human in the loop.
3/ Every account buys AND sells. A reputation graph tracks who reliably delivers and gates how much an agent can spend autonomously. That graph is the moat.
4/ Try it: `npx -y github:SIML-Inc/Manca demo`. Zero deps, live dashboard, x402-native. Repo → github.com/SIML-Inc/Manca

## Subreddits / communities
r/AI_Agents, r/mcp, r/LocalLLaMA (tooling), LangChain + CrewAI + Composio Discords, Product Hunt.

## Cold-start note
It's two-sided — seed SUPPLY first. Wrap 5-10 real digital services (scraper, LLM-eval, data API) as Manca seller agents so the first buyers find something to buy, THEN drive buyers from the directories above.
