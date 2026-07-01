// Zero-dependency cryptography using Node's built-in crypto (Ed25519).
// Every account and every mandate/offer is cryptographically signed so the
// clearinghouse can verify authority without trusting the transport.
import {
  createHash,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  createPublicKey,
  createPrivateKey,
  randomBytes,
} from "node:crypto";

export interface KeyPair {
  publicKey: string; // base64url SPKI
  privateKey: string; // base64url PKCS8
}

export function newKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url"),
  };
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function id(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

// Canonical JSON so signatures are stable regardless of key order.
export function canonical(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonical).join(",")}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonical((obj as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

export function signPayload(privateKeyB64u: string, payload: unknown): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKeyB64u, "base64url"),
    format: "der",
    type: "pkcs8",
  });
  return edSign(null, Buffer.from(canonical(payload)), key).toString("base64url");
}

export function verifyPayload(
  publicKeyB64u: string,
  payload: unknown,
  signatureB64u: string,
): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyB64u, "base64url"),
      format: "der",
      type: "spki",
    });
    return edVerify(
      null,
      Buffer.from(canonical(payload)),
      key,
      Buffer.from(signatureB64u, "base64url"),
    );
  } catch {
    return false;
  }
}
