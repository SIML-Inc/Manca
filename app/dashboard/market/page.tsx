"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usd, Pill, SectionTitle, short } from "../../_components/kit";

const CATEGORIES = ["web-scrape", "compute", "data-enrichment", "llm-eval", "translation", "image-gen"];

type Verification =
  | { type: "value_threshold"; field: string; min: number }
  | { type: "json_schema"; requires: Record<string, unknown> }
  | { type: "hash_match"; sha256: string }
  | { type: "http_ok"; url: string; expectStatus?: number }
  | { type: "manual" };

export default function Market() {
  const accounts = useQuery(api.accounts.list, {});
  const offers = useQuery(api.market.offers, {});
  const mandates = useQuery(api.market.mandates, {});
  const trades = useQuery(api.market.trades, {});
  const negotiations = useQuery(api.negotiate.list, {});
  const [negoOffer, setNegoOffer] = useState<any>(null);

  const myAccountIds = useMemo(() => new Set((accounts ?? []).map((a) => a.id)), [accounts]);

  return (
    <div className="space-y-10">
      <div className="grid lg:grid-cols-2 gap-6">
        <SellForm accounts={accounts ?? []} />
        <BuyForm accounts={accounts ?? []} />
      </div>

      {/* order book */}
      <section>
        <SectionTitle right={<span className="tag">{offers?.length ?? 0} live</span>}>Order book</SectionTitle>
        <div className="panel overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b" style={{ color: "var(--color-muted)" }}>
                <Th>item</Th><Th>category</Th><Th>seller</Th><Th right>price</Th><Th right>rep</Th><Th right>avail</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {offers?.length === 0 && <tr><td colSpan={7} className="p-4" style={{ color: "var(--color-faint)" }}>No offers posted.</td></tr>}
              {offers?.map((o) => (
                <tr key={o.id} className="border-b" style={{ borderColor: "var(--color-border)" }}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      {o.imageUrl
                        ? <img src={o.imageUrl} alt="" className="w-9 h-9 object-cover border shrink-0" style={{ borderColor: "var(--color-border)" }} />
                        : <div className="w-9 h-9 border shrink-0" style={{ borderColor: "var(--color-border)", background: "var(--color-panel-2)" }} />}
                      <span className="truncate max-w-[16rem]">{o.title ?? "—"}</span>
                    </div>
                  </Td>
                  <Td>{o.category}</Td>
                  <Td>{o.seller}</Td>
                  <Td right accent>{usd(o.price)}</Td>
                  <Td right>{o.sellerReputation}</Td>
                  <Td right>{o.available}</Td>
                  <Td right>
                    {o.active
                      ? <button className="btn" onClick={() => setNegoOffer(o)}>{o.negotiable ? "Negotiate" : "Buy"}</button>
                      : <span className="tag">closed</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* my mandates */}
      <section>
        <SectionTitle>Your buy mandates</SectionTitle>
        <div className="space-y-2">
          {mandates?.length === 0 && <div className="panel p-4 text-[13px]" style={{ color: "var(--color-faint)" }}>No mandates yet.</div>}
          {mandates?.map((m) => <MandateRow key={m.id} m={m} />)}
        </div>
      </section>

      {/* negotiations */}
      {(negotiations?.length ?? 0) > 0 && (
        <section>
          <SectionTitle right={<span className="tag">agent to agent</span>}>Negotiations</SectionTitle>
          <div className="space-y-2">
            {negotiations?.map((n) => <NegotiationRow key={n.id} n={n} />)}
          </div>
        </section>
      )}

      {/* trades ledger */}
      <section>
        <SectionTitle right={<span className="tag">{trades?.length ?? 0} total</span>}>Trade ledger</SectionTitle>
        <div className="space-y-2">
          {trades?.length === 0 && <div className="panel p-4 text-[13px]" style={{ color: "var(--color-faint)" }}>No trades cleared yet.</div>}
          {trades?.map((t) => <TradeRow key={t.id} t={t} mine={myAccountIds.has(t.sellerId)} />)}
        </div>
      </section>

      {negoOffer && <NegotiateModal offer={negoOffer} accounts={accounts ?? []} onClose={() => setNegoOffer(null)} />}
    </div>
  );
}

function Transcript({ rounds }: { rounds: { actor: string; price: number; message: string }[] }) {
  return (
    <div className="space-y-2">
      {rounds.map((r, i) => {
        const buyer = r.actor === "buyer";
        return (
          <div key={i} className={`flex ${buyer ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%] border px-3 py-2" style={{ borderColor: "var(--color-border-strong)", background: buyer ? "var(--color-panel-2)" : "var(--color-panel)" }}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="label" style={{ color: buyer ? "var(--color-blue)" : "var(--color-accent)" }}>{r.actor}</span>
                <span className="text-[13px] tabular-nums">{usd(r.price)}</span>
              </div>
              <div className="text-[13px]" style={{ color: "var(--color-muted)" }}>{r.message}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NegotiationRow({ n }: { n: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel">
      <button className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 justify-between" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-center gap-3 text-[13px]">
          <Pill status={n.status === "agreed" ? "settled" : "failed"} />
          <span>{n.category}</span>
          <span style={{ color: "var(--color-faint)" }}>list {usd(n.listPrice)}</span>
          {n.status === "agreed" ? <span style={{ color: "var(--color-accent)" }}>agreed {usd(n.agreedPrice)}</span> : <span style={{ color: "var(--color-red)" }}>no deal</span>}
          <span className="tag">{n.engine === "deterministic" ? "rules" : "glm"}</span>
        </div>
        <span className="text-[12px]" style={{ color: "var(--color-faint)" }}>{open ? "hide" : `${n.rounds.length} turns`}</span>
      </button>
      {open && <div className="border-t p-4"><Transcript rounds={n.rounds} /></div>}
    </div>
  );
}

function NegotiateModal({ offer, accounts, onClose }: { offer: any; accounts: any[]; onClose: () => void }) {
  const negotiate = useAction(api.negotiate.negotiate);
  const buyNow = useMutation(api.market.buyNow);
  const fixed = !offer.negotiable;
  const [buyerId, setBuyerId] = useState("");
  const [maxPrice, setMaxPrice] = useState(String(Math.round(offer.price * 0.9)));
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function startNegotiation() {
    setBusy(true); setErr(null); setResult(null);
    try {
      setResult(await negotiate({ buyerId: buyerId as any, offerId: offer.id, buyerMax: Number(maxPrice), execute: true }));
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function purchase() {
    setBusy(true); setErr(null); setResult(null);
    try {
      const t: any = await buyNow({ buyerId: buyerId as any, offerId: offer.id });
      setResult({ bought: true, price: t.price, tradeId: t._id });
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="panel w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display">{fixed ? "Buy" : "Negotiate"}</span>
            <span className="tag">{offer.title ?? offer.category}</span>
            <span className="tag" style={{ color: fixed ? "var(--color-muted)" : "var(--color-accent)", borderColor: fixed ? "var(--color-border-strong)" : "var(--color-accent-dim)" }}>{fixed ? "fixed price" : "negotiable"}</span>
            <span className="text-[12px]" style={{ color: "var(--color-faint)" }}>list {usd(offer.price)}</span>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>close</button>
        </div>
        <div className="p-4 space-y-3">
          {offer.description && !result && (
            <p className="text-[13px] leading-relaxed border-b pb-3" style={{ color: "var(--color-muted)" }}>{offer.description}</p>
          )}
          {!result && (
            <>
              <div>
                <label className="label block mb-1">buy as</label>
                <select className="input" value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                  <option value="">select your account…</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} · {usd(a.balance)}</option>)}
                </select>
              </div>
              {fixed ? (
                <>
                  <p className="text-[13px]" style={{ color: "var(--color-muted)" }}>
                    This seller set a fixed price. Buy now at <span style={{ color: "var(--color-accent)" }}>{usd(offer.price)}</span>.
                  </p>
                  {err && <p className="text-[13px]" style={{ color: "var(--color-red)" }}>{err}</p>}
                  <button className="btn btn-accent w-full" disabled={busy || !buyerId} onClick={purchase}>
                    {busy ? "buying…" : `Buy now · ${usd(offer.price)}`}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="label block mb-1">your max price</label>
                    <input className="input" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
                  </div>
                  {err && <p className="text-[13px]" style={{ color: "var(--color-red)" }}>{err}</p>}
                  <button className="btn btn-accent w-full" disabled={busy || !buyerId} onClick={startNegotiation}>
                    {busy ? "agents negotiating…" : "Start negotiation"}
                  </button>
                </>
              )}
            </>
          )}
          {result?.bought && (
            <div className="space-y-2 text-[13px]">
              <div>Bought at <span style={{ color: "var(--color-accent)" }}>{usd(result.price)}</span>.</div>
              <div style={{ color: "var(--color-green)" }}>Trade locked in escrow. Seller fulfils to settle.</div>
              <button className="btn btn-ghost w-full mt-2" onClick={onClose}>done</button>
            </div>
          )}
          {result && !result.bought && (
            <div className="space-y-3">
              <Transcript rounds={result.rounds} />
              <div className="border-t pt-3">
                {result.status === "agreed" ? (
                  <div className="space-y-1 text-[13px]">
                    <div>Agreed at <span style={{ color: "var(--color-accent)" }}>{usd(result.agreedPrice)}</span>, saving {usd(result.savedVsList)} off list.</div>
                    {result.tradeId && <div style={{ color: "var(--color-green)" }}>Trade locked in escrow. Seller fulfils to settle.</div>}
                    {result.tradeError && <div style={{ color: "var(--color-red)" }}>Deal reached but trade could not lock: {result.tradeError}</div>}
                  </div>
                ) : (
                  <div className="text-[13px]" style={{ color: "var(--color-red)" }}>No deal. Your max was below the seller's floor.</div>
                )}
                <button className="btn btn-ghost w-full mt-3" onClick={onClose}>done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`px-4 py-2.5 font-normal label ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, right, accent }: { children: React.ReactNode; right?: boolean; accent?: boolean }) {
  return <td className={`px-4 py-2.5 tabular-nums ${right ? "text-right" : "text-left"}`} style={{ color: accent ? "var(--color-accent)" : undefined }}>{children}</td>;
}

function AccountSelect({ accounts, value, onChange, filterSupplier }: { accounts: any[]; value: string; onChange: (v: string) => void; filterSupplier?: boolean }) {
  const list = filterSupplier ? accounts.filter((a) => a.verifiedSupplier) : accounts;
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">select account…</option>
      {list.map((a) => (
        <option key={a.id} value={a.id}>{a.label} (@{a.handle})</option>
      ))}
    </select>
  );
}

function SellForm({ accounts }: { accounts: any[] }) {
  const sell = useMutation(api.market.sell);
  const genUploadUrl = useMutation(api.files.generateUploadUrl);
  const [sellerId, setSellerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [price, setPrice] = useState("40");
  const [available, setAvailable] = useState("5");
  const [mode, setMode] = useState<"fixed" | "negotiable">("fixed");
  const [floor, setFloor] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [storageId, setStorageId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setMsg(null);
    try {
      const url = await genUploadUrl({});
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!res.ok) throw new Error("upload failed");
      const { storageId } = await res.json();
      setStorageId(storageId);
      setPreview(URL.createObjectURL(file));
    } catch (err) { setMsg("Photo upload failed: " + (err as Error).message); }
    setUploading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setBusy(true);
    try {
      await sell({
        sellerId: sellerId as any, category, price: Number(price), available: Number(available), slaSeconds: 60,
        title: title || undefined,
        description: description || undefined,
        imageStorageId: (storageId as any) || undefined,
        floorPrice: mode === "negotiable" && floor ? Number(floor) : undefined,
      });
      setMsg("Offer posted.");
      setTitle(""); setDescription(""); setPreview(null); setStorageId(null); setFloor("");
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="panel p-5 space-y-3">
      <div className="label">Post a sell offer</div>
      <AccountSelect accounts={accounts} value={sellerId} onChange={setSellerId} filterSupplier />
      {accounts.filter((a) => a.verifiedSupplier).length === 0 && (
        <p className="text-[12px]" style={{ color: "var(--color-amber)" }}>Only verified suppliers can sell. Enable it on the Overview page.</p>
      )}
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="product title (e.g. Wool Runner)" />
      <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="short description buyers and their agents will see" />
      <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label block mb-1">price</label><input className="input" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div><label className="label block mb-1">available</label><input className="input" value={available} onChange={(e) => setAvailable(e.target.value)} /></div>
      </div>
      <div>
        <label className="label block mb-1">pricing</label>
        <div className="grid grid-cols-2 border" style={{ borderColor: "var(--color-border-strong)" }}>
          {(["fixed", "negotiable"] as const).map((m) => (
            <button type="button" key={m} onClick={() => setMode(m)} className="py-2 text-[13px]"
              style={{ background: mode === m ? "var(--color-accent)" : "transparent", color: mode === m ? "#0a0a0a" : "var(--color-muted)", fontWeight: mode === m ? 600 : 400 }}>
              {m === "fixed" ? "Fixed price" : "Negotiable"}
            </button>
          ))}
        </div>
      </div>
      {mode === "negotiable" && (
        <div>
          <label className="label block mb-1">lowest you'll accept (floor)</label>
          <input className="input" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder={`below ${price}`} />
        </div>
      )}
      <div className="flex items-center gap-3">
        {preview
          ? <img src={preview} alt="preview" className="w-16 h-16 object-cover border" style={{ borderColor: "var(--color-border-strong)" }} />
          : <div className="w-16 h-16 border grid place-items-center text-[11px]" style={{ borderColor: "var(--color-border)", color: "var(--color-faint)" }}>no photo</div>}
        <label className="btn btn-ghost cursor-pointer">
          {uploading ? "uploading…" : preview ? "change photo" : "upload photo"}
          <input type="file" accept="image/*" className="hidden" onChange={onPhoto} disabled={uploading} />
        </label>
      </div>
      {msg && <p className="text-[13px]" style={{ color: msg === "Offer posted." ? "var(--color-green)" : "var(--color-red)" }}>{msg}</p>}
      <button className="btn btn-accent w-full" disabled={busy || uploading || !sellerId}>{busy ? "..." : "Post offer"}</button>
    </form>
  );
}

function BuyForm({ accounts }: { accounts: any[] }) {
  const buy = useMutation(api.market.buy);
  const [buyerId, setBuyerId] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [maxPrice, setMaxPrice] = useState("50");
  const [referencePrice, setReferencePrice] = useState("60");
  const [insured, setInsured] = useState(false);
  const [vtype, setVtype] = useState<Verification["type"]>("value_threshold");
  const [vField, setVField] = useState("rows");
  const [vMin, setVMin] = useState("5000");
  const [vRequires, setVRequires] = useState('{"ok": true}');
  const [vHash, setVHash] = useState("");
  const [vUrl, setVUrl] = useState("https://");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function verification(): Verification {
    switch (vtype) {
      case "value_threshold": return { type: "value_threshold", field: vField, min: Number(vMin) };
      case "json_schema": return { type: "json_schema", requires: JSON.parse(vRequires || "{}") };
      case "hash_match": return { type: "hash_match", sha256: vHash };
      case "http_ok": return { type: "http_ok", url: vUrl };
      case "manual": return { type: "manual" };
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setBusy(true);
    try {
      await buy({
        buyerId: buyerId as any, category, maxPrice: Number(maxPrice),
        referencePrice: referencePrice ? Number(referencePrice) : undefined,
        insured, verification: verification() as any,
        deadline: Date.now() + 3600 * 1000,
      });
      setMsg("Mandate posted. Match it below.");
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="panel p-5 space-y-3">
      <div className="label">Post a buy mandate</div>
      <AccountSelect accounts={accounts} value={buyerId} onChange={setBuyerId} />
      <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label block mb-1">max price</label><input className="input" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} /></div>
        <div><label className="label block mb-1">reference price</label><input className="input" value={referencePrice} onChange={(e) => setReferencePrice(e.target.value)} /></div>
      </div>
      <div>
        <label className="label block mb-1">verification rule</label>
        <select className="input" value={vtype} onChange={(e) => setVtype(e.target.value as Verification["type"])}>
          <option value="value_threshold">value_threshold</option>
          <option value="json_schema">json_schema</option>
          <option value="hash_match">hash_match</option>
          <option value="http_ok">http_ok</option>
          <option value="manual">manual</option>
        </select>
      </div>
      {vtype === "value_threshold" && (
        <div className="grid grid-cols-2 gap-3">
          <input className="input" value={vField} onChange={(e) => setVField(e.target.value)} placeholder="field" />
          <input className="input" value={vMin} onChange={(e) => setVMin(e.target.value)} placeholder="min" />
        </div>
      )}
      {vtype === "json_schema" && <input className="input" value={vRequires} onChange={(e) => setVRequires(e.target.value)} placeholder='{"ok": true}' />}
      {vtype === "hash_match" && <input className="input" value={vHash} onChange={(e) => setVHash(e.target.value)} placeholder="sha256 hex" />}
      {vtype === "http_ok" && <input className="input" value={vUrl} onChange={(e) => setVUrl(e.target.value)} placeholder="https://…" />}
      <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--color-muted)" }}>
        <input type="checkbox" checked={insured} onChange={(e) => setInsured(e.target.checked)} />
        insure this trade (guaranteed fulfillment)
      </label>
      {msg && <p className="text-[13px]" style={{ color: msg.startsWith("Mandate") ? "var(--color-green)" : "var(--color-red)" }}>{msg}</p>}
      <button className="btn btn-accent w-full" disabled={busy || !buyerId}>{busy ? "..." : "Post mandate"}</button>
    </form>
  );
}

function MandateRow({ m }: { m: any }) {
  const match = useMutation(api.market.match);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 justify-between">
      <div className="flex items-center gap-3 text-[13px]">
        <Pill status={m.status} />
        <span>{m.category}</span>
        <span style={{ color: "var(--color-muted)" }}>max {usd(m.maxPrice)}</span>
        <span className="tag">{m.verification.type}{m.insured ? " · insured" : ""}</span>
      </div>
      <div className="flex items-center gap-2">
        {msg && <span className="text-[12px]" style={{ color: msg.startsWith("Matched") ? "var(--color-green)" : "var(--color-red)" }}>{msg}</span>}
        {m.status === "open" && (
          <button className="btn" disabled={busy} onClick={async () => {
            setBusy(true); setMsg(null);
            try { const t = await match({ mandateId: m.id }); setMsg("Matched · " + short(t._id)); }
            catch (e) { setMsg((e as Error).message); }
            setBusy(false);
          }}>Match</button>
        )}
      </div>
    </div>
  );
}

function TradeRow({ t, mine }: { t: any; mine: boolean }) {
  const fulfill = useAction(api.market.fulfill);
  const [payload, setPayload] = useState(defaultPayload(t.verification));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="panel">
      <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 justify-between">
        <div className="flex items-center gap-3 text-[13px]">
          <Pill status={t.status} />
          <span>{t.category}</span>
          <span style={{ color: "var(--color-muted)" }}>{t.buyer} → {t.seller}</span>
          <span className="tabular-nums" style={{ color: "var(--color-accent)" }}>{usd(t.price)}</span>
          {t.insured && <span className="tag">insured</span>}
        </div>
        {t.tx && <span className="text-[12px]" style={{ color: "var(--color-faint)" }}>{t.settlementMode}:{short(t.tx, 10)}</span>}
      </div>
      {t.status === "matched" && mine && (
        <div className="border-t px-4 py-3 space-y-2">
          <div className="label">deliver payload (you are the seller)</div>
          <div className="flex gap-2">
            <input className="input" value={payload} onChange={(e) => setPayload(e.target.value)} />
            <button className="btn btn-accent" disabled={busy} onClick={async () => {
              setBusy(true); setMsg(null);
              try {
                const r: any = await fulfill({ tradeId: t.id, payload: safeJson(payload) });
                setMsg(r?.verdict?.verified ? "Settled · " + (r.verdict.reason ?? "") : "Rejected · " + (r?.verdict?.reason ?? ""));
              } catch (e) { setMsg((e as Error).message); }
              setBusy(false);
            }}>Fulfill</button>
          </div>
          {msg && <p className="text-[13px]" style={{ color: msg.startsWith("Settled") ? "var(--color-green)" : "var(--color-red)" }}>{msg}</p>}
        </div>
      )}
    </div>
  );
}

function defaultPayload(v: any): string {
  if (!v) return "{}";
  if (v.type === "value_threshold") return JSON.stringify({ [v.field]: v.min });
  if (v.type === "json_schema") return JSON.stringify(v.requires);
  return "{}";
}
function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
