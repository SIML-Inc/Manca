#!/usr/bin/env node
// Manca CLI: init | serve | mcp | demo
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { newKeyPair } from "./core/crypto.ts";
import { randomBytes } from "node:crypto";
import { configPath } from "./core/config.ts";

const cmd = process.argv[2];

async function main() {
  switch (cmd) {
    case "init": {
      // Generate a UNIQUE network identity for this deployment. Not a template —
      // every Manca network has its own keypair and id.
      mkdirSync(".manca", { recursive: true });
      if (existsSync(".manca/network.json")) {
        console.log("network already initialized at .manca/network.json");
        return;
      }
      const kp = newKeyPair();
      const networkId = "manca_" + randomBytes(8).toString("hex");
      writeFileSync(
        ".manca/network.json",
        JSON.stringify({ networkId, ...kp, createdAt: new Date().toISOString() }, null, 2),
      );
      console.log(`initialized network ${networkId}`);
      console.log(`private key written to .manca/network.json (gitignored)`);
      console.log(`config: ${configPath()}`);
      break;
    }
    case "serve": {
      const { startHttp } = await import("./server/http.ts");
      startHttp(Number(process.env.PORT ?? 8787));
      break;
    }
    case "mcp": {
      const { startMcp } = await import("./server/mcp.ts");
      startMcp();
      break;
    }
    case "demo": {
      await import("./demo.ts");
      break;
    }
    default:
      console.log("Manca — the missing trust layer for agent-to-agent commerce");
      console.log("usage: manca <init|serve|mcp|demo>");
      console.log("  init   generate this deployment's unique network identity");
      console.log("  serve  start the HTTP clearing API (PORT env, default 8787)");
      console.log("  mcp    start the MCP server on stdio (one config, any agent)");
      console.log("  demo   run the end-to-end A2A settlement demo");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
