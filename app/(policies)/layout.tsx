import Link from "next/link";
import { SiteFooter } from "../_components/SiteFooter";

export default function PolicyLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto max-w-3xl px-5 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5" style={{ background: "var(--color-accent)" }} />
            <span className="font-display text-lg tracking-tight">manca</span>
          </Link>
          <Link className="btn btn-ghost" href="/">Back to site</Link>
        </div>
      </header>
      <div className="flex-1 mx-auto max-w-3xl w-full px-5 py-12">{children}</div>
      <SiteFooter />
    </main>
  );
}
