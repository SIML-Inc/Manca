"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usd, Pill, SectionTitle } from "../../_components/kit";

const PLATFORMS = [
  { key: "shopify", name: "Shopify", note: "One click. Paste your store URL." },
  { key: "amazon", name: "Amazon", note: "Needs SP-API developer app." },
  { key: "tiktok", name: "TikTok Shop", note: "Needs Partner Center app." },
  { key: "ebay", name: "eBay", note: "Needs developer keyset." },
] as const;

export default function Stores() {
  const accounts = useQuery(api.accounts.list, {});
  const connections = useQuery(api.connectors.list, {});
  const status = useQuery(api.connectors.platformStatus, {});

  return (
    <div className="space-y-10">
      <section>
        <SectionTitle>Connect a storefront</SectionTitle>
        <p className="text-[13px] mb-4" style={{ color: "var(--color-muted)" }}>
          Link a store and its live catalog becomes machine-verifiable sell-offers on the Manca network, so any
          buyer agent can purchase it with escrow and settlement. Shopify connects in one click today. The other
          marketplaces need a registered developer app before sellers can OAuth in.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px border" style={{ background: "var(--color-border)" }}>
          {PLATFORMS.map((p) => {
            const s = (status as any)?.[p.key];
            const live = s?.live;
            return (
              <div key={p.key} className="p-4" style={{ background: "var(--color-panel)" }}>
                <div className="flex items-center justify-between">
                  <span className="font-display">{p.name}</span>
                  <span className="tag" style={{ color: live ? "var(--color-green)" : "var(--color-amber)", borderColor: live ? "var(--color-green)" : "var(--color-amber)" }}>
                    {live ? "live" : "needs app"}
                  </span>
                </div>
                <div className="mt-2 text-[12px]" style={{ color: "var(--color-faint)" }}>{p.note}</div>
              </div>
            );
          })}
        </div>
      </section>

      <ConnectShopify accounts={accounts ?? []} />

      <section>
        <SectionTitle right={<span className="tag">{connections?.length ?? 0}</span>}>Connected stores</SectionTitle>
        <div className="space-y-3">
          {connections?.length === 0 && (
            <div className="panel p-4 text-[13px]" style={{ color: "var(--color-faint)" }}>No stores connected yet.</div>
          )}
          {connections?.map((c) => <ConnectionCard key={c.id} c={c} />)}
        </div>
      </section>
    </div>
  );
}

function ConnectShopify({ accounts }: { accounts: any[] }) {
  const connect = useAction(api.connectors.connectShopify);
  const [accountId, setAccountId] = useState("");
  const [shopUrl, setShopUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ok = msg?.startsWith("Imported");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r: any = await connect({ accountId: accountId as any, shopUrl });
      setMsg(`Imported ${r.imported} products.`);
      setShopUrl("");
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="panel p-5 space-y-3">
      <div className="label">Connect a Shopify store</div>
      <div className="grid md:grid-cols-[1fr_1.5fr_auto] gap-3">
        <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">post under account…</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <input className="input" value={shopUrl} onChange={(e) => setShopUrl(e.target.value)} placeholder="allbirds.com or your-store.myshopify.com" />
        <button className="btn btn-accent" disabled={busy || !accountId || !shopUrl}>{busy ? "importing…" : "Connect"}</button>
      </div>
      {accounts.length === 0 && <p className="text-[12px]" style={{ color: "var(--color-amber)" }}>Open an account on the Overview page first.</p>}
      {msg && <p className="text-[13px]" style={{ color: ok ? "var(--color-green)" : "var(--color-red)" }}>{msg}</p>}
      <p className="text-[12px]" style={{ color: "var(--color-faint)" }}>
        Connecting makes this account a verified supplier. Products with no public price are skipped.
      </p>
    </form>
  );
}

function ConnectionCard({ c }: { c: any }) {
  const sync = useAction(api.connectors.syncConnection);
  const disconnect = useMutation(api.connectors.disconnect);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const products = useQuery(api.connectors.products, open ? { connectionId: c.id } : "skip");

  return (
    <div className="panel">
      <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display capitalize">{c.platform}</span>
          {c.shopUrl && <span className="tag">{c.shopUrl}</span>}
          <Pill status={c.status === "connected" ? "settled" : c.status === "error" ? "failed" : "open"} />
          <span className="text-[12px]" style={{ color: "var(--color-muted)" }}>{c.productCount} products · {c.account}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost" onClick={() => setOpen((v) => !v)}>{open ? "hide" : "view"}</button>
          <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await sync({ connectionId: c.id }); } catch {} setBusy(false); }}>
            {busy ? "…" : "Sync"}
          </button>
          <button className="btn btn-ghost" onClick={() => disconnect({ connectionId: c.id })}>Disconnect</button>
        </div>
      </div>
      {open && (
        <div className="border-t p-4">
          {products === undefined && <div className="text-[13px]" style={{ color: "var(--color-muted)" }}>Loading…</div>}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products?.map((p) => (
              <a key={p.id} href={p.productUrl ?? "#"} target="_blank" rel="noreferrer" className="border block" style={{ borderColor: "var(--color-border)" }}>
                {p.imageUrl
                  ? <img src={p.imageUrl} alt={p.title} className="w-full aspect-square object-cover" />
                  : <div className="w-full aspect-square" style={{ background: "var(--color-panel-2)" }} />}
                <div className="p-2">
                  <div className="text-[12px] truncate">{p.title}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[13px] tabular-nums" style={{ color: "var(--color-accent)" }}>{usd(p.price)}</span>
                    <span className="text-[11px]" style={{ color: p.active ? "var(--color-green)" : "var(--color-faint)" }}>{p.active ? `${p.available} in stock` : "out"}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
