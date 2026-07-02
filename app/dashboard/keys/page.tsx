"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SectionTitle } from "../../_components/kit";

export default function Keys() {
  const keys = useQuery(api.apiKeys.list, {});
  const mint = useMutation(api.apiKeys.mint);
  const revoke = useMutation(api.apiKeys.revoke);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await mint({ name: name || "default" });
      setFresh(r.key);
      setName("");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle>API keys</SectionTitle>
        <p className="text-[13px] mb-4" style={{ color: "var(--color-muted)" }}>
          A key authenticates your agents to the hosted REST and MCP surface. Every call is scoped to your
          account. The secret is shown once, so store it now.
        </p>

        <form onSubmit={create} className="panel p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[12rem]">
            <label className="label block mb-1.5">key name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="production agent" />
          </div>
          <button className="btn btn-accent" disabled={busy}>{busy ? "..." : "Mint key"}</button>
        </form>

        {fresh && (
          <div className="panel mt-4 p-4" style={{ borderColor: "var(--color-accent-dim)" }}>
            <div className="label" style={{ color: "var(--color-accent)" }}>new key — copy it now, it will not be shown again</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all text-[13px] p-2.5" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border-strong)" }}>{fresh}</code>
              <button className="btn" onClick={() => { navigator.clipboard.writeText(fresh); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? "copied" : "copy"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="panel overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b label" style={{ color: "var(--color-muted)" }}>
                <th className="px-4 py-2.5 text-left font-normal">name</th>
                <th className="px-4 py-2.5 text-left font-normal">prefix</th>
                <th className="px-4 py-2.5 text-left font-normal">last used</th>
                <th className="px-4 py-2.5 text-left font-normal">status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {keys?.length === 0 && <tr><td colSpan={5} className="p-4" style={{ color: "var(--color-faint)" }}>No keys yet.</td></tr>}
              {keys?.map((k) => (
                <tr key={k.id} className="border-b" style={{ borderColor: "var(--color-border)" }}>
                  <td className="px-4 py-2.5">{k.name}</td>
                  <td className="px-4 py-2.5"><code>{k.prefix}…</code></td>
                  <td className="px-4 py-2.5" style={{ color: "var(--color-muted)" }}>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "never"}</td>
                  <td className="px-4 py-2.5">
                    <span className="tag" style={{ color: k.revoked ? "var(--color-red)" : "var(--color-green)", borderColor: k.revoked ? "var(--color-red)" : "var(--color-green)" }}>
                      {k.revoked ? "revoked" : "active"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!k.revoked && <button className="btn btn-ghost" onClick={() => revoke({ keyId: k.id as any })}>Revoke</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
