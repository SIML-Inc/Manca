// Generate Convex Auth JWT keys the exact way @convex-dev/auth does, and set
// them (plus SITE_URL) on the Convex deployment non-interactively.
// Usage: CONVEX_DEPLOY_KEY=... node scripts/setup-auth-keys.mjs [siteUrl]
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";
import { spawnSync } from "node:child_process";

const siteUrl = process.argv[2] ?? "http://localhost:3000";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });
const JWT_PRIVATE_KEY = privateKey.trimEnd().replace(/\n/g, " ");

function setEnv(name, value) {
  const res = spawnSync("npx", ["convex", "env", "set", name, "--", value], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: process.env,
  });
  const out = (res.stdout || "") + (res.stderr || "");
  console.log(`set ${name}: ${res.status === 0 ? "ok" : "FAILED"}`);
  if (res.status !== 0) console.log(out.trim());
}

setEnv("JWT_PRIVATE_KEY", JWT_PRIVATE_KEY);
setEnv("JWKS", jwks);
setEnv("SITE_URL", siteUrl);
console.log("done");
