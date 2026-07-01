import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Clearinghouse } from "../src/core/clearinghouse.ts";
import { loadConfig } from "../src/core/config.ts";
import { Agent } from "../src/agent.ts";
import { X402Rail } from "../src/rails/x402.ts";
import { InternalRail, buildRail } from "../src/rails/settlement.ts";

const x402cfg = () => loadConfig().settlement!.x402;

test("mock x402 rail settles deterministically, no network", async () => {
  const rail = new X402Rail({ ...x402cfg(), mode: "mock" });
  const a = await rail.settle({ to: "0xabc", amount: 12.5, ref: "trd_1" });
  const b = await rail.settle({ to: "0xabc", amount: 12.5, ref: "trd_1" });
  assert.equal(a.success, true);
  assert.equal(a.rail, "x402");
  assert.equal(a.mode, "mock");
  assert.match(a.txHash!, /^0x[0-9a-f]{64}$/);
  assert.equal(a.txHash, b.txHash, "deterministic for same inputs");
});

test("configured rail is x402 mock and stamps trades with a tx hash", async () => {
  const hub = new Clearinghouse(new Store(), loadConfig());
  await hub.useConfiguredRail();
  assert.equal(hub.rail.name, "x402");

  const buyer = new Agent(hub, "b").deposit(100);
  const seller = new Agent(hub, "s").becomeVerifiedSupplier();
  seller.sell({ category: "c", attributes: {}, price: 20, slaSeconds: 60, available: 1 });
  const m = buyer.buy({
    category: "c", spec: {}, maxPrice: 30, minReputation: 0, insured: false,
    verification: { type: "json_schema", requires: { ok: true } }, deadline: Date.now() + 10_000,
  });
  const trade = hub.match(m.id);
  const { trade: settled } = await seller.fulfill(trade.id, { ok: true });
  assert.equal(settled.status, "settled");
  assert.equal(settled.settlementRail, "x402");
  assert.equal(settled.settlementMode, "mock");
  assert.match(settled.settlementTx!, /^0x[0-9a-f]{64}$/);
});

test("real modes are gated: testnet needs a key, mainnet needs opt-in", async () => {
  const oldKey = process.env.X402_PRIVATE_KEY;
  const oldAllow = process.env.X402_ALLOW_MAINNET;
  delete process.env.X402_PRIVATE_KEY;
  delete process.env.X402_ALLOW_MAINNET;
  const testnet = new X402Rail({ ...x402cfg(), mode: "testnet" });
  await assert.rejects(() => testnet.settle({ to: "0x" + "1".repeat(40), amount: 1, ref: "r" }), /X402_PRIVATE_KEY/);
  const mainnet = new X402Rail({ ...x402cfg(), mode: "mainnet", allowMainnet: false });
  await assert.rejects(() => mainnet.settle({ to: "0x" + "1".repeat(40), amount: 1, ref: "r" }), /mainnet is disabled/);
  if (oldKey) process.env.X402_PRIVATE_KEY = oldKey;
  if (oldAllow) process.env.X402_ALLOW_MAINNET = oldAllow;
});

test("buildRail returns InternalRail when configured", async () => {
  const cfg = loadConfig();
  const internal = await buildRail({ ...cfg, settlement: { rail: "internal", x402: cfg.settlement!.x402 } });
  assert.ok(internal instanceof InternalRail);
  const r = await internal.settle({ to: "x", amount: 1, ref: "r" });
  assert.equal(r.txHash, null);
});
