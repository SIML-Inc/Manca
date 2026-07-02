import { query } from "./_generated/server";
import { MANCA_CONFIG } from "./lib/config";
import * as Model from "./model";

// Network P&L — the shared clearinghouse is public, so anyone can see it clears
// profitably. clearing fee · float yield · savings share · insurance · subs.
export const report = query({
  args: {},
  handler: async (ctx) => Model.revenueReport(ctx),
});

export const whoami = query({
  args: {},
  handler: async () => ({
    network: MANCA_CONFIG.network,
    clearing: MANCA_CONFIG.clearing,
    float: MANCA_CONFIG.float,
    insurance: MANCA_CONFIG.insurance,
    savingsShare: MANCA_CONFIG.savingsShare,
    verifiedSupply: MANCA_CONFIG.verifiedSupply,
    settlement: MANCA_CONFIG.settlement,
  }),
});
