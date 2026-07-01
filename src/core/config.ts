import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { MancaConfig } from "../types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

export function loadConfig(path?: string): MancaConfig {
  const p = path ?? join(repoRoot, "manca.config.json");
  return JSON.parse(readFileSync(p, "utf8")) as MancaConfig;
}

export function configPath(): string {
  return join(repoRoot, "manca.config.json");
}
