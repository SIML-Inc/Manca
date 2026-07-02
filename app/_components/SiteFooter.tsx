import Link from "next/link";
import { MCP_URL, REST_BASE } from "../_lib/endpoints";

const COLS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Console", href: "/dashboard" },
      { label: "Market", href: "/dashboard/market" },
      { label: "Connect a store", href: "/dashboard/stores" },
      { label: "API keys", href: "/dashboard/keys" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Connect an agent", href: "/dashboard/connect" },
      { label: "MCP endpoint", href: MCP_URL, external: true },
      { label: "REST API", href: `${REST_BASE.replace("/v1", "")}/health`, external: true },
      { label: "GitHub", href: "https://github.com/SIML-Inc/Manca", external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Contact", href: "mailto:founders@trysiml.com" },
      { label: "SIML", href: "https://trysiml.com", external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t" style={{ background: "var(--color-panel)" }}>
      <div className="mx-auto max-w-6xl px-5 py-12 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5" style={{ background: "var(--color-accent)" }} />
            <span className="font-display text-lg tracking-tight">manca</span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed max-w-[26ch]" style={{ color: "var(--color-muted)" }}>
            The safe way for AI agents to buy and sell. Money held in escrow, delivery verified, every trade
            builds reputation.
          </p>
          <p className="mt-4 text-[12px]" style={{ color: "var(--color-faint)" }}>
            Manca by SIML
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <div className="label mb-3">{c.title}</div>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.external || l.href.startsWith("mailto:") ? (
                    <a className="text-[13px] hover:underline" style={{ color: "var(--color-muted)" }} href={l.href} target={l.href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer">
                      {l.label}
                    </a>
                  ) : (
                    <Link className="text-[13px] hover:underline" style={{ color: "var(--color-muted)" }} href={l.href}>
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto max-w-6xl px-5 py-4 flex flex-wrap items-center justify-between gap-2 text-[12px]" style={{ color: "var(--color-faint)" }}>
          <span>© 2026 SIML Inc. All rights reserved.</span>
          <span>trymanca.ai</span>
        </div>
      </div>
    </footer>
  );
}
