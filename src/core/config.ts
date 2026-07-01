import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { MancaConfig } from "../types.ts";

// Walk up from a starting directory to find manca.config.json. Works whether we
// run from source (src/core/) or from a bundled dist/ file inside a package.
function findConfig(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    const p = join(dir, "manca.config.json");
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolvePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const found = findConfig(here) ?? findConfig(process.cwd());
  if (!found) throw new Error("manca.config.json not found (looked up from module and cwd)");
  return found;
}

export function loadConfig(path?: string): MancaConfig {
  return JSON.parse(readFileSync(path ?? resolvePath(), "utf8")) as MancaConfig;
}

export function configPath(): string {
  return resolvePath();
}
