import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sweep overdue trades once a minute so deadlines are enforced without a human.
crons.interval("expire overdue trades", { seconds: 60 }, internal.maintenance.expireSweep, {});

export default crons;
