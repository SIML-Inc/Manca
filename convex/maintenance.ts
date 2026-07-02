import { internalMutation } from "./_generated/server";
import * as Model from "./model";

// Network maintenance: fail overdue matched trades, refund escrow, pay
// insurance, penalize the delinquent seller. Runs on a cron.
export const expireSweep = internalMutation({
  args: {},
  handler: async (ctx) => ({ failed: await Model.expire(ctx) }),
});
