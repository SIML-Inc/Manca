import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Clearinghouse, MancaError } from "../src/core/clearinghouse.ts";
import { loadConfig } from "../src/core/config.ts";
import { Agent } from "../src/agent.ts";

function freshHub() {
  const cfg = loadConfig();
  return new Clearinghouse(new Store(), cfg);
}

test("symmetric account: one agent can both buy and sell", () => {
  const hub = freshHub();
  const a = new Agent(hub, "dual").deposit(1000).becomeVerifiedSupplier();
  const offer = a.sell({ category: "compute", attributes: { gpu: "h100" }, price: 5, slaSeconds: 60, available: 3 });
  const mandate = a.buy({
    category: "data",
    spec: {},
    maxPrice: 10,
    minReputation: 0,
    insured: false,
    verification: { type: "manual" },
    deadline: Date.now() + 10_000,
  });
  assert.equal(offer.sellerId, mandate.buyerId, "same account is both sides");
});

test("happy path: match -> machine-verified fulfillment -> atomic settlement", async () => {
  const hub = freshHub();
  const buyer = new Agent(hub, "buyer").deposit(100);
  const seller = new Agent(hub, "seller").becomeVerifiedSupplier();

  seller.sell({ category: "web-scrape", attributes: { rows: 1000 }, price: 20, slaSeconds: 60, available: 1 });
  const mandate = buyer.buy({
    category: "web-scrape",
    spec: { rows: 1000 },
    maxPrice: 25,
    minReputation: 0,
    referencePrice: 30,
    insured: false,
    verification: { type: "value_threshold", field: "rows", min: 1000 },
    deadline: Date.now() + 10_000,
  });

  const trade = hub.match(mandate.id);
  assert.equal(trade.status, "matched");
  // buyer locked price + clearing fee
  assert.ok(buyer.view().escrowLocked > 20);

  const { verdict } = await seller.fulfill(trade.id, { rows: 1500 });
  assert.equal(verdict.verified, true);

  const t = hub.store.trades.get(trade.id)!;
  assert.equal(t.status, "settled");
  // seller got paid ~price (buyer pays the clearing fee in default config)
  assert.ok(seller.view().balance >= 19.9 && seller.view().balance <= 20.001);
  // reputation went up for both
  assert.ok(seller.view().reputation > 500);
  assert.ok(buyer.view().reputation > 500);
});

test("failed verification does not settle; funds stay escrowed", async () => {
  const hub = freshHub();
  const buyer = new Agent(hub, "b").deposit(100);
  const seller = new Agent(hub, "s").becomeVerifiedSupplier();
  seller.sell({ category: "x", attributes: {}, price: 10, slaSeconds: 60, available: 1 });
  const m = buyer.buy({
    category: "x",
    spec: {},
    maxPrice: 20,
    minReputation: 0,
    insured: false,
    verification: { type: "hash_match", sha256: "deadbeef" },
    deadline: Date.now() + 10_000,
  });
  const trade = hub.match(m.id);
  const { verdict } = await seller.fulfill(trade.id, "wrong-content");
  assert.equal(verdict.verified, false);
  assert.equal(hub.store.trades.get(trade.id)!.status, "matched");
  assert.equal(seller.view().balance, 0, "seller not paid on failed verification");
});

test("expiry refunds the buyer and dings the seller", () => {
  const hub = freshHub();
  const buyer = new Agent(hub, "b").deposit(100);
  const seller = new Agent(hub, "s").becomeVerifiedSupplier();
  seller.sell({ category: "x", attributes: {}, price: 10, slaSeconds: 1, available: 1 });
  const m = buyer.buy({
    category: "x",
    spec: {},
    maxPrice: 20,
    minReputation: 0,
    insured: false,
    verification: { type: "manual" },
    deadline: Date.now() - 1, // already overdue
  });
  const trade = hub.match(m.id);
  const before = seller.view().reputation;
  const failed = hub.expire(Date.now());
  assert.equal(failed, 1);
  assert.equal(hub.store.trades.get(trade.id)!.status, "failed");
  assert.equal(buyer.view().escrowLocked, 0, "escrow released back");
  assert.ok(buyer.view().balance > 99.9, "buyer refunded in full");
  assert.ok(seller.view().reputation < before, "seller reputation dropped");
});

test("revenue accrues: clearing fee + float + savings share", async () => {
  const hub = freshHub();
  const buyer = new Agent(hub, "b").deposit(1000);
  const seller = new Agent(hub, "s").becomeVerifiedSupplier();
  seller.sell({ category: "c", attributes: {}, price: 100, slaSeconds: 60, available: 1 });
  const m = buyer.buy({
    category: "c",
    spec: {},
    maxPrice: 120,
    minReputation: 0,
    referencePrice: 150, // buyer would have paid 150 elsewhere -> savings share on 50
    insured: false,
    verification: { type: "json_schema", requires: { ok: true } },
    deadline: Date.now() + 10_000,
  });
  const trade = hub.match(m.id);
  await seller.fulfill(trade.id, { ok: true });
  const rep = hub.revenueReport();
  assert.ok(rep.breakdown.clearing_fee > 0, "clearing fee booked");
  assert.ok(rep.breakdown.savings_share > 0, "savings share booked");
  assert.ok(rep.breakdown.verified_supply_subscription >= 99, "subscription booked");
  assert.ok(rep.total > 0, "network is profitable");
});

test("insured trade: premium earned on success", async () => {
  const hub = freshHub();
  const buyer = new Agent(hub, "b").deposit(1000);
  const seller = new Agent(hub, "s").becomeVerifiedSupplier();
  seller.sell({ category: "c", attributes: {}, price: 100, slaSeconds: 60, available: 1 });
  const m = buyer.buy({
    category: "c",
    spec: {},
    maxPrice: 120,
    minReputation: 0,
    insured: true,
    verification: { type: "json_schema", requires: { ok: true } },
    deadline: Date.now() + 10_000,
  });
  const trade = hub.match(m.id);
  assert.ok(hub.insurancePool > 0, "premium moved into pool at match");
  await seller.fulfill(trade.id, { ok: true });
  assert.ok(hub.revenueReport().breakdown.insurance_premium > 0, "premium earned on settle");
});

test("authority gate: rejects a signature from the wrong key", () => {
  const hub = freshHub();
  const buyer = new Agent(hub, "b").deposit(100);
  // tamper: post a mandate signed for different fields
  assert.throws(() => {
    hub.postBuyMandate(
      {
        buyerId: buyer.id,
        category: "x",
        spec: {},
        maxPrice: 10,
        minReputation: 0,
        insured: false,
        verification: { type: "manual" },
        deadline: Date.now() + 1000,
      },
      "not-a-real-signature",
    );
  }, MancaError);
});

test("autonomous spend limit blocks oversized human-not-present spend", () => {
  const hub = freshHub();
  const buyer = new Agent(hub, "b").deposit(1_000_000);
  const seller = new Agent(hub, "s").becomeVerifiedSupplier();
  // start reputation 500 -> limit 0.5 * 100000 = 50000; price above that must block
  seller.sell({ category: "c", attributes: {}, price: 60_000, slaSeconds: 60, available: 1 });
  const m = buyer.buy({
    category: "c",
    spec: {},
    maxPrice: 70_000,
    minReputation: 0,
    insured: false,
    verification: { type: "manual" },
    deadline: Date.now() + 10_000,
  });
  assert.throws(() => hub.match(m.id), /autonomous spend limit/);
});
