#!/usr/bin/env node
// Cross-version launcher so `npx github:SIML-Inc/Manca <cmd>` just works.
// Node strips TypeScript types natively; on 22.6-23.5 it needs the flag, on
// 23.6+ it's on by default. We add the flag only when required.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.ts");
const [maj, min] = process.versions.node.split(".").map(Number);
const needsFlag = maj < 23 || (maj === 23 && min < 6);
const args = [...(needsFlag ? ["--experimental-strip-types"] : []), cli, ...process.argv.slice(2)];

const r = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(r.status ?? 0);
