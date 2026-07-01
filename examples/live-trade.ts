// Fire real signed trades at a RUNNING Manca server and watch the dashboard move.
//
//   1. terminal A:  MANCA_SEED=1 npm run serve      (then open http://localhost:8787)
//   2. terminal B:  node --experimental-strip-types examples/live-trade.ts
//
// Optional: pass a count ->  node ... examples/live-trade.ts 5
import { newKeyPair, signPayload } from "../src/core/crypto.ts";
import { canonicalMandate, canonicalOffer } from "../src/core/clearinghouse.ts";

const API = process.env.MANCA_API ?? "http://localhost:8787";
const post = (p: string, b: unknown) =>
  fetch(API + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
const get = (p: string) => fetch(API + p).then((r) => r.json());

const CATS = ["web-scrape", "compute", "data-enrichment", "llm-eval", "translation", "image-gen"];
const count = Number(process.argv[2] ?? 3);

for (let i = 0; i < count; i++) {
  const cat = CATS[i % CATS.length];
  const price = 20 + Math.round((i * 37) % 180);
  const bk = newKeyPair(), sk = newKeyPair();
  const buyer = await post("/accounts", { label: `buyer-${i + 1}`, publicKey: bk.publicKey });
  const seller = await post("/accounts", { label: `seller-${i + 1}`, publicKey: sk.publicKey });
  await post(`/accounts/${buyer.id}/deposit`, { amount: price * 3 });
  await post(`/accounts/${seller.id}/verify`, {});

  const oi = { sellerId: seller.id, category: cat, attributes: {}, price, slaSeconds: 60, available: 1 };
  await post("/offers", { ...oi, signature: signPayload(sk.privateKey, canonicalOffer(oi)) });

  const insured = i % 2 === 0;
  const willFail = i % 4 === 3; // every 4th trade the seller "misses"
  const mi = {
    buyerId: buyer.id, category: cat, spec: {}, maxPrice: price + 50, minReputation: 0,
    referencePrice: price + 40, insured,
    verification: { type: "json_schema" as const, requires: { ok: true } },
    deadline: willFail ? Date.now() - 1 : Date.now() + 60_000,
  };
  const mand = await post("/mandates", { ...mi, signature: signPayload(bk.privateKey, canonicalMandate(mi)) });

  try {
    const trade = await post("/match", { mandateId: mand.id });
    if (willFail) {
      await post("/expire", {});
      console.log(`  ${cat.padEnd(15)} $${price}  -> FAILED (seller missed deadline, buyer refunded)`);
    } else {
      const r = await post("/fulfill", { tradeId: trade.id, payload: { ok: true } });
      console.log(`  ${cat.padEnd(15)} $${price}  ${insured ? "🛡️ " : "  "}-> ${r.verdict.verified ? "SETTLED" : "rejected"}`);
    }
  } catch (e) {
    console.log(`  ${cat}: ${(e as Error).message}`);
  }
}

const s = await get("/revenue");
console.log(`\nnetwork revenue now: $${s.total}  (${s.settled} settled, ${s.failed} failed)`);
console.log("open http://localhost:8787 to watch it live.");
