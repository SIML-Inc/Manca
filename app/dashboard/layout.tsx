"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/market", label: "Market" },
  { href: "/dashboard/stores", label: "Stores" },
  { href: "/dashboard/keys", label: "API Keys" },
  { href: "/dashboard/connect", label: "Connect" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const me = useQuery(api.users.me, {});

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b sticky top-0 z-10" style={{ background: "var(--color-bg)" }}>
        <div className="mx-auto max-w-6xl px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5" style={{ background: "var(--color-accent)" }} />
              <span className="font-display text-lg tracking-tight">manca</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {NAV.map((n) => {
                const active = n.href === "/dashboard" ? pathname === n.href : pathname.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="px-3 py-1.5 text-sm border"
                    style={{
                      borderColor: active ? "var(--color-border-strong)" : "transparent",
                      background: active ? "var(--color-panel-2)" : "transparent",
                      color: active ? "var(--color-fg)" : "var(--color-muted)",
                    }}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[12px]" style={{ color: "var(--color-faint)" }}>
              {me?.email ?? ""}
            </span>
            <button
              className="btn btn-ghost"
              onClick={async () => { await signOut(); router.push("/"); }}
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="md:hidden flex border-t">
          {NAV.map((n) => {
            const active = n.href === "/dashboard" ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className="flex-1 text-center py-2 text-[13px] border-r"
                style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}>
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="flex-1 mx-auto max-w-6xl w-full px-5 py-8">{children}</div>
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-5 py-4 flex flex-wrap items-center justify-between gap-2 text-[12px]" style={{ color: "var(--color-faint)" }}>
          <span>Manca by SIML · © 2026 SIML Inc</span>
          <span className="flex gap-4">
            <Link className="hover:underline" href="/terms">Terms</Link>
            <Link className="hover:underline" href="/privacy">Privacy</Link>
            <a className="hover:underline" href="mailto:founders@trysiml.com">Contact</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
