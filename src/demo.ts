// End-to-end demo: autonomous agent-to-agent digital commerce on Manca, with
// money accruing to the network in real time. Run: npm run demo
import { Store } from "./core/store.ts";
import { Clearinghouse } from "./core/clearinghouse.ts";
import { loadConfig } from "./core/config.ts";
import { Agent } from "./agent.ts";

const B = "\x1b[1m", D = "\x1b[2m", G = "\x1b[32m", Y = "\x1b[33m", C = "\x1b[36m", R = "\x1b[31m", X = "\x1b[0m";
const usd = (n: number) => `$${n.toFixed(4)}`;
function line(s = "") { console.log(s); }
function head(s: string) { line(`\n${B}${C}${s}${X}`); }

async function main() {
  const cfg = loadConfig();
  // deterministic offline http probe for the demo
  const hub = new Clearinghouse(new Store(), cfg, async (u) => (u.includes("healthy") ? 200 : 500));
  await hub.useConfiguredRail(); // x402 (mock) — settlement produces tx hashes

  line(`${B}Manca${X} ${D}// ${cfg.network.name} (${cfg.network.id})${X}`);
  line(`${D}The missing trust layer for agent-to-agent commerce.${X}`);
  line(`${D}settlement rail: ${JSON.stringify(hub.rail.status())}${X}`);

  // Everyone is a symmetric clearing account: buyer and seller at once.
  const acme = new Agent(hub, "ACME procurement agent").deposit(5000);
  const scrapers = new Agent(hub, "ScrapeFarm sell-agent").becomeVerifiedSupplier();
  const gpu = new Agent(hub, "NimbusGPU sell-agent").becomeVerifiedSupplier();
  const flaky = new Agent(hub, "FlakyData sell-agent").becomeVerifiedSupplier();

  head("1. Sellers post machine-committable offers");
  scrapers.sell({ category: "web-scrape", attributes: { rows: 5000 }, price: 40, slaSeconds: 30, available: 5 });
  gpu.sell({ category: "compute", attributes: { gpu: "h100", hours: 1 }, price: 120, slaSeconds: 30, available: 3 });
  flaky.sell({ category: "data-enrichment", attributes: { records: 1000 }, price: 25, slaSeconds: 30, available: 2 });
  line(`${D}ScrapeFarm: web-scrape @ ${usd(40)} | NimbusGPU: compute @ ${usd(120)} | FlakyData: enrichment @ ${usd(25)}${X}`);

  head("2. Buyer agent expresses intent -> Manca matches + escrows -> seller fulfills -> auto-settle");
  // (a) verified by value threshold
  let m = acme.buy({
    category: "web-scrape", spec: { rows: 5000 }, maxPrice: 50, minReputation: 0,
    referencePrice: 60, insured: false,
    verification: { type: "value_threshold", field: "rows", min: 5000 },
    deadline: Date.now() + 60_000,
  });
  let t = hub.match(m.id);
  line(`  matched ${C}web-scrape${X} -> escrow locked ${usd(acme.view().escrowLocked)} (autonomy limit ${usd(acme.view().autonomousSpendLimit)})`);
  let r = await scrapers.fulfill(t.id, { rows: 5200 });
  line(`  fulfillment verdict: ${r.verdict.verified ? G + "VERIFIED" : R + "REJECTED"}${X} (${(r.verdict as any).reason}) -> ${G}settled${X}, seller paid ${usd(scrapers.view().balance)}`);
  line(`  ${D}settled on ${r.trade.settlementRail}/${r.trade.settlementMode}, tx ${String(r.trade.settlementTx).slice(0, 18)}…${X}`);

  // (b) verified by http probe
  m = acme.buy({
    category: "compute", spec: { gpu: "h100" }, maxPrice: 150, minReputation: 0,
    referencePrice: 140, insured: true,
    verification: { type: "http_ok", url: "https://nimbus.example/job/healthy", expectStatus: 200 },
    deadline: Date.now() + 60_000,
  });
  t = hub.match(m.id);
  line(`  matched ${C}compute${X} (insured) -> premium into pool ${usd(hub.insurancePool)}`);
  r = await gpu.fulfill(t.id, { done: true });
  line(`  fulfillment verdict: ${r.verdict.verified ? G + "VERIFIED" : R + "REJECTED"}${X} -> ${G}settled${X}, seller paid ${usd(gpu.view().balance)}`);

  head("3. A seller fails to deliver -> escrow auto-refunds the buyer, reputation drops");
  m = acme.buy({
    category: "data-enrichment", spec: { records: 1000 }, maxPrice: 30, minReputation: 0,
    insured: true,
    verification: { type: "json_schema", requires: { delivered: true } },
    deadline: Date.now() - 1, // overdue immediately to simulate a miss
  });
  t = hub.match(m.id);
  const repBefore = flaky.view().reputation;
  const failed = hub.expire(Date.now());
  line(`  ${R}${failed} trade failed${X}: buyer refunded (balance ${usd(acme.view().balance)}), FlakyData reputation ${repBefore} -> ${flaky.view().reputation}`);

  head("4. The network P&L — profitable from the first cleared trade");
  const rep = hub.revenueReport();
  for (const [k, v] of Object.entries(rep.breakdown)) {
    const col = v >= 0 ? G : R;
    line(`  ${k.padEnd(30)} ${col}${usd(v)}${X}`);
  }
  line(`  ${B}${"TOTAL NETWORK REVENUE".padEnd(30)} ${G}${usd(rep.total)}${X}`);
  line(`  ${D}settled: ${rep.settled} | failed: ${rep.failed} | insurance pool: ${usd(rep.insurancePool)}${X}`);

  head("Reputation graph (the compounding moat)");
  for (const a of [acme, scrapers, gpu, flaky]) {
    const v = a.view();
    line(`  ${v.label.padEnd(28)} rep ${Y}${v.reputation}${X}  ok ${v.successfulTrades}  fail ${v.failedTrades}  autonomy ${usd(v.autonomousSpendLimit)}`);
  }
  line();
}

main().catch((e) => {
  console.error("demo error:", e);
  process.exit(1);
});
