"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";

export default function SignIn() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email, password, flow });
      router.push("/dashboard");
    } catch (err) {
      setError(
        flow === "signUp"
          ? "Could not create the account. The email may already be registered, or the password is too weak."
          : "Invalid email or password.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid-lines flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2 mb-8 justify-center">
          <span className="inline-block w-2.5 h-2.5" style={{ background: "var(--color-accent)" }} />
          <span className="font-display text-xl tracking-tight">manca</span>
        </Link>

        <div className="panel p-6">
          <div className="flex border-b mb-5">
            {(["signUp", "signIn"] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFlow(f); setError(null); }}
                className="flex-1 pb-2.5 text-sm border-b-2"
                style={{
                  borderColor: flow === f ? "var(--color-accent)" : "transparent",
                  color: flow === f ? "var(--color-fg)" : "var(--color-muted)",
                }}
              >
                {f === "signUp" ? "Create account" : "Sign in"}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn w-full mb-4"
            onClick={() => void signIn("google", { redirectTo: "/dashboard" }).catch(() => setError("Google sign-in is not enabled yet on this network."))}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
              <path fill="#EA4335" d="M12 5.04c1.62 0 3.06.56 4.2 1.64l3.12-3.12C17.46 1.8 14.94.75 12 .75 7.44.75 3.51 3.36 1.59 7.17l3.66 2.84C6.15 7.26 8.85 5.04 12 5.04z"/>
              <path fill="#4285F4" d="M23.49 12.27c0-.93-.08-1.61-.26-2.32H12v4.21h6.47c-.13 1.08-.83 2.71-2.4 3.81l3.58 2.77c2.14-1.97 3.84-4.87 3.84-8.47z"/>
              <path fill="#FBBC05" d="M5.26 14.28A7.19 7.19 0 0 1 4.88 12c0-.79.14-1.56.36-2.28L1.58 6.88A11.97 11.97 0 0 0 .27 12c0 1.93.46 3.75 1.31 5.36l3.68-3.08z"/>
              <path fill="#34A853" d="M12 23.25c3.24 0 5.96-1.07 7.94-2.9l-3.58-2.77c-.98.67-2.28 1.13-4.36 1.13-3.15 0-5.85-2.22-6.74-5.03l-3.67 3.08c1.91 3.85 5.85 6.49 10.41 6.49z"/>
            </svg>
            Continue with Google
          </button>
          <div className="flex items-center gap-3 mb-4">
            <span className="flex-1 border-t" />
            <span className="text-[11px]" style={{ color: "var(--color-faint)" }}>or with email</span>
            <span className="flex-1 border-t" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label block mb-1.5">email</label>
              <input className="input" type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@yourco.ai" />
            </div>
            <div>
              <label className="label block mb-1.5">password</label>
              <input className="input" type="password" required autoComplete={flow === "signUp" ? "new-password" : "current-password"}
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters" minLength={8} />
            </div>
            {error && <p className="text-[13px]" style={{ color: "var(--color-red)" }}>{error}</p>}
            <button className="btn btn-accent w-full" type="submit" disabled={busy}>
              {busy ? "..." : flow === "signUp" ? "Create account" : "Sign in"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-[12px]" style={{ color: "var(--color-faint)" }}>
          One account gives you every operation: open agents, buy, sell, settle.
        </p>
      </div>
    </main>
  );
}
