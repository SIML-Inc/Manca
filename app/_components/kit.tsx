"use client";

export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function short(id: string, n = 8): string {
  return id.length <= n + 3 ? id : id.slice(0, n) + "…";
}

export function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="p-4">
      <div className="label">{label}</div>
      <div className="mt-1.5 text-lg font-display tabular-nums" style={{ color: accent ? "var(--color-accent)" : "var(--color-fg)" }}>
        {value}
      </div>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  settled: "var(--color-green)",
  matched: "var(--color-amber)",
  open: "var(--color-blue)",
  failed: "var(--color-red)",
  expired: "var(--color-faint)",
};

export function Pill({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? "var(--color-muted)";
  return (
    <span className="tag" style={{ color: c, borderColor: c }}>
      <span className="inline-block w-1.5 h-1.5" style={{ background: c }} />
      {status}
    </span>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-display text-base tracking-tight">{children}</h2>
      {right}
    </div>
  );
}
