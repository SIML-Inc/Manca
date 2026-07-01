// Machine-verifiable fulfillment. This is the mechanism that makes autonomous
// (human-not-present) settlement actually safe: a deal only settles when the
// delivered payload provably satisfies the buyer's verification rule.
import { sha256 } from "./crypto.ts";
import type { VerificationRule } from "../types.ts";

export interface VerdictResult {
  verified: boolean;
  reason: string;
  machineAdjudicable: boolean;
}

// httpProbe is injectable so tests/demo stay deterministic and offline.
export type HttpProbe = (url: string) => Promise<number>;

const defaultHttpProbe: HttpProbe = async (url: string) => {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.status;
  } catch {
    return 0;
  }
};

export async function verifyFulfillment(
  rule: VerificationRule,
  payload: unknown,
  httpProbe: HttpProbe = defaultHttpProbe,
): Promise<VerdictResult> {
  switch (rule.type) {
    case "json_schema": {
      if (payload === null || typeof payload !== "object")
        return { verified: false, reason: "payload is not an object", machineAdjudicable: true };
      const obj = payload as Record<string, unknown>;
      for (const [k, want] of Object.entries(rule.requires)) {
        if (!(k in obj))
          return { verified: false, reason: `missing key '${k}'`, machineAdjudicable: true };
        if (want !== null && JSON.stringify(obj[k]) !== JSON.stringify(want))
          return { verified: false, reason: `key '${k}' mismatch`, machineAdjudicable: true };
      }
      return { verified: true, reason: "schema satisfied", machineAdjudicable: true };
    }
    case "hash_match": {
      const val = typeof payload === "string" ? payload : JSON.stringify(payload);
      const ok = sha256(val) === rule.sha256;
      return {
        verified: ok,
        reason: ok ? "hash matched" : "hash mismatch",
        machineAdjudicable: true,
      };
    }
    case "value_threshold": {
      const obj = (payload ?? {}) as Record<string, unknown>;
      const v = obj[rule.field];
      const ok = typeof v === "number" && v >= rule.min;
      return {
        verified: ok,
        reason: ok ? `${rule.field} >= ${rule.min}` : `${rule.field} below ${rule.min}`,
        machineAdjudicable: true,
      };
    }
    case "http_ok": {
      const status = await httpProbe(rule.url);
      const want = rule.expectStatus ?? 200;
      const ok = status === want;
      return {
        verified: ok,
        reason: ok ? `http ${status}` : `http ${status} != ${want}`,
        machineAdjudicable: true,
      };
    }
    case "manual":
      // Physical / subjective goods: NOT machine-adjudicable. Manca flags these
      // as requiring a human attestation and never auto-settles them.
      return {
        verified: false,
        reason: "manual verification required",
        machineAdjudicable: false,
      };
  }
}
