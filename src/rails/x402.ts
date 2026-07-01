// x402 settlement rail — moves USDC via the x402 protocol (HTTP 402 + EIP-3009
// `exact` scheme, facilitator /verify + /settle). Verified against the x402 spec
// (coinbase/x402 specs/schemes/exact/scheme_exact_evm.md).
//
// SAFETY: default mode is "mock" — deterministic, offline, NOTHING real moves.
//   mode "testnet"  → Base Sepolia, real testnet USDC (needs env + viem)
//   mode "mainnet"  → Base, REAL money — hard-gated behind allowMainnet + env
import { createHash, randomBytes } from "node:crypto";
import type { SettlementRail, SettleRequest, SettleResult } from "./settlement.ts";
import type { X402Config } from "../types.ts";

// Facilitator response shapes (from x402Specs.ts).
interface VerifyResponse { isValid: boolean; invalidReason?: string; payer?: string }
interface SettleResponseWire { success: boolean; errorReason?: string; payer?: string; transaction: string; network: string }

export class X402Rail implements SettlementRail {
  readonly name = "x402";
  private cfg: X402Config;
  constructor(cfg: X402Config) {
    this.cfg = cfg;
  }

  status() {
    return {
      rail: "x402",
      mode: this.cfg.mode,
      network: this.cfg.network,
      facilitator: this.cfg.facilitator,
      asset: this.cfg.asset,
      mainnetAllowed: this.cfg.allowMainnet === true || process.env.X402_ALLOW_MAINNET === "1",
      real: this.cfg.mode !== "mock",
    };
  }

  private atomic(amount: number): string {
    return BigInt(Math.round(amount * 10 ** this.cfg.usdcDecimals)).toString();
  }

  async settle(req: SettleRequest): Promise<SettleResult> {
    if (this.cfg.mode === "mock") {
      // Deterministic pseudo tx hash. Offline. Nothing on any chain.
      const h = createHash("sha256").update(`${req.ref}:${req.to}:${this.atomic(req.amount)}`).digest("hex");
      return { rail: "x402", mode: "mock", network: this.cfg.network, txHash: `0x${h.slice(0, 64)}`, success: true, note: "mock settlement — no on-chain movement" };
    }

    if (this.cfg.mode === "mainnet") {
      const allowed = this.cfg.allowMainnet === true || process.env.X402_ALLOW_MAINNET === "1";
      if (!allowed) throw new Error("x402 mainnet is disabled. Set settlement.x402.allowMainnet=true or X402_ALLOW_MAINNET=1 to move REAL money.");
    }

    const pk = process.env.X402_PRIVATE_KEY;
    if (!pk) throw new Error("x402 real settlement needs X402_PRIVATE_KEY (the Manca escrow wallet).");
    if (!/^0x[0-9a-fA-F]{40}$/.test(req.to)) throw new Error(`x402 real settlement needs an EVM payout address for the payee, got '${req.to}'`);

    // viem is an OPTIONAL dependency, loaded only for real settlement.
    let signTypedData: any, privateKeyToAccount: any;
    try {
      ({ privateKeyToAccount } = await import("viem/accounts"));
    } catch {
      throw new Error("real x402 settlement needs viem. Run: npm i viem");
    }
    const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
    const chainId = Number(this.cfg.network.split(":")[1]);

    const now = Math.floor(Date.now() / 1000);
    const authorization = {
      from: account.address as string,
      to: req.to,
      value: this.atomic(req.amount),
      validAfter: "0",
      validBefore: String(now + this.cfg.maxTimeoutSeconds),
      nonce: `0x${randomBytes(32).toString("hex")}`,
    };

    const signature = await account.signTypedData({
      domain: { name: this.cfg.usdcName, version: this.cfg.usdcVersion, chainId, verifyingContract: this.cfg.asset },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" }, { name: "to", type: "address" },
          { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from, to: authorization.to, value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
    });

    const requirements = {
      scheme: "exact", network: this.cfg.network, maxAmountRequired: authorization.value,
      resource: `manca:${req.ref}`, description: `Manca settlement ${req.ref}`, mimeType: "application/json",
      payTo: req.to, maxTimeoutSeconds: this.cfg.maxTimeoutSeconds, asset: this.cfg.asset,
      extra: { assetTransferMethod: "eip3009", name: this.cfg.usdcName, version: this.cfg.usdcVersion },
    };
    const paymentPayload = { x402Version: 1, scheme: "exact", network: this.cfg.network, payload: { signature, authorization } };

    const post = async (path: string) => {
      const r = await fetch(`${this.cfg.facilitator}${path}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentPayload, paymentRequirements: requirements }),
      });
      if (!r.ok) throw new Error(`x402 facilitator ${path} -> HTTP ${r.status}: ${await r.text()}`);
      return r.json();
    };

    const verify = (await post("/verify")) as VerifyResponse;
    if (!verify.isValid) throw new Error(`x402 verify failed: ${verify.invalidReason ?? "unknown"}`);
    const settled = (await post("/settle")) as SettleResponseWire;
    if (!settled.success) throw new Error(`x402 settle failed: ${settled.errorReason ?? "unknown"}`);

    return { rail: "x402", mode: this.cfg.mode, network: settled.network, txHash: settled.transaction, success: true };
  }
}
