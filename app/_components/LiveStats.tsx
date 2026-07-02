"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function usd(n: number | undefined): string {
  if (n === undefined) return "—";
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function LiveStats() {
  const report = useQuery(api.revenue.report, {});
  const cells: { label: string; value: string; accent?: boolean }[] = [
    { label: "network revenue", value: usd(report?.total), accent: true },
    { label: "trades cleared", value: report ? String(report.settled) : "—" },
    { label: "trades failed", value: report ? String(report.failed) : "—" },
    { label: "insurance pool", value: usd(report?.insurancePool) },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 border">
      {cells.map((c) => (
        <div key={c.label} className="p-4">
          <div className="label">{c.label}</div>
          <div
            className="mt-2 text-xl font-display tabular-nums"
            style={{ color: c.accent ? "var(--color-accent)" : "var(--color-fg)" }}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}
