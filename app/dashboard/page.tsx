"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usd, Stat, SectionTitle } from "../_components/kit";

const REASON_LABEL: Record<string, string> = {
  clearing_fee: "clearing fee",
  float_yield: "float yield",
  savings_share: "savings share",
  insurance_premium: "insurance",
  verified_supply_subscription: "verified supply",
};

export default function Overview() {
  const report = useQuery(api.revenue.report, {});
  const accounts = useQuery(api.accounts.list, {});
  const billing = useQuery(api.billing.config, {});
  const open = useMutation(api.accounts.open);
  const becomeSupplier = useMutation(api.accounts.becomeSupplier);

  const [label, setLabel] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await open({ label: label || handle, handle: handle || label.toLowerCase().replace(/\s+/g, "-") });
      setLabel("");
      setHandle("");
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-10">
      {/* network P&L */}
      <section>
        <SectionTitle right={<span className="tag">Manca Prime</span>}>Network P&amp;L</SectionTitle>
        <div className="panel">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0">
            <Stat label="total revenue" value={usd(report?.total)} accent />
            <Stat label="insurance pool" value={usd(report?.insurancePool)} />
            <Stat label="cleared" value={report ? String(report.settled) : "—"} />
            <Stat label="failed" value={report ? String(report.failed) : "—"} />
          </div>
          <div className="border-t px-4 py-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px]" style={{ color: "var(--color-muted)" }}>
            {report && Object.keys(report.breakdown).length === 0 && <span>No revenue booked yet. Clear a trade to see it accrue.</span>}
            {report &&
              Object.entries(report.breakdown).map(([k, v]) => (
                <span key={k}>
                  {REASON_LABEL[k] ?? k}: <span style={{ color: "var(--color-fg)" }}>{usd(v as number)}</span>
                </span>
              ))}
          </div>
        </div>
      </section>

      {/* your agents */}
      <section>
        <SectionTitle>Your agents</SectionTitle>
        <div className="grid lg:grid-cols-3 gap-6">
          <form onSubmit={createAccount} className="panel p-5 space-y-4 lg:col-span-1 self-start">
            <div className="label">Open a clearing account</div>
            <div>
              <label className="label block mb-1.5">label</label>
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ACME procurement" />
            </div>
            <div>
              <label className="label block mb-1.5">handle</label>
              <input className="input" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="acme" />
            </div>
            {err && <p className="text-[13px]" style={{ color: "var(--color-red)" }}>{err}</p>}
            <button className="btn btn-accent w-full" disabled={busy}>{busy ? "..." : "Open account"}</button>
            <p className="text-[12px]" style={{ color: "var(--color-faint)" }}>
              Each account can both buy and sell. Balance starts at $0; reputation starts at 500.
            </p>
          </form>

          <div className="lg:col-span-2 space-y-3">
            {accounts === undefined && <div className="panel p-5 text-sm" style={{ color: "var(--color-muted)" }}>Loading…</div>}
            {accounts && accounts.length === 0 && (
              <div className="panel p-5 text-sm" style={{ color: "var(--color-muted)" }}>
                No accounts yet. Open one to start clearing.
              </div>
            )}
            {accounts?.map((a) => (
              <div key={a.id} className="panel">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-display">{a.label}</span>
                    <span className="tag">@{a.handle}</span>
                    {a.verifiedSupplier && <span className="tag" style={{ color: "var(--color-accent)", borderColor: "var(--color-accent-dim)" }}>verified supplier</span>}
                  </div>
                  <span className="text-[12px]" style={{ color: "var(--color-faint)" }}>rep {a.reputation}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 divide-x">
                  <Stat label="balance" value={usd(a.balance)} accent />
                  <Stat label="in escrow" value={usd(a.escrowLocked)} />
                  <Stat label="spend limit" value={usd(a.autonomousSpendLimit)} />
                  <Stat label="trades" value={`${a.successfulTrades}/${a.successfulTrades + a.failedTrades}`} />
                </div>
                <div className="border-t px-4 py-3 flex flex-wrap items-center gap-2">
                  <TopUp accountId={a.id} billing={billing} />
                  {!a.verifiedSupplier && (
                    <button className="btn btn-ghost" onClick={() => becomeSupplier({ accountId: a.id as any })}>
                      Become verified supplier
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// Money in. Card top-up (Stripe Checkout) when payments are enabled; a clearly
// labeled test credit while the network runs in test mode. Otherwise nothing —
// every balance starts at zero.
function TopUp({ accountId, billing }: { accountId: string; billing: any }) {
  const createTopup = useAction(api.billing.createTopup);
  const testDeposit = useMutation(api.accounts.deposit);
  const [amt, setAmt] = useState("100");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function card() {
    setBusy(true); setErr(null);
    try {
      const { url } = await createTopup({ accountId: accountId as any, amountUsd: Number(amt) || 0 });
      window.location.href = url;
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  async function test() {
    setBusy(true); setErr(null);
    try { await testDeposit({ accountId: accountId as any, amount: Number(amt) || 0 }); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center">
        <span className="input flex items-center justify-center" style={{ width: "2rem", borderRight: "none", color: "var(--color-faint)" }}>$</span>
        <input className="input" style={{ width: "6rem" }} value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" />
      </div>
      {billing?.stripeEnabled && (
        <button className="btn btn-accent" disabled={busy} onClick={card}>{busy ? "…" : "Top up with card"}</button>
      )}
      {billing?.testCreditsEnabled && (
        <button className="btn" disabled={busy} onClick={test} title="Free credit while the network runs in test mode">
          {busy ? "…" : "Add test credit"}
        </button>
      )}
      {billing && !billing.stripeEnabled && !billing.testCreditsEnabled && (
        <span className="text-[12px]" style={{ color: "var(--color-faint)" }}>Card payments are being enabled.</span>
      )}
      {err && <span className="text-[12px]" style={{ color: "var(--color-red)" }}>{err}</span>}
    </div>
  );
}
