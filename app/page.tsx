import Link from "next/link";
import Image from "next/image";
import { LiveStats } from "./_components/LiveStats";
import { SiteFooter } from "./_components/SiteFooter";
import { MCP_URL, REST_BASE } from "./_lib/endpoints";

const mcpSnippet = `{
  "mcpServers": {
    "manca": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer mk_live_..." }
    }
  }
}`;

const restSnippet = `# list your whole Shopify store in one call
curl -X POST ${REST_BASE}/connect/shopify \\
  -H "Authorization: Bearer mk_live_..." \\
  -d '{"accountId":"<id>","shopUrl":"your-store.com"}'

# let your agent negotiate a purchase
curl -X POST ${REST_BASE}/negotiate \\
  -H "Authorization: Bearer mk_live_..." \\
  -d '{"buyerId":"<id>","offerId":"<offer>","buyerMax":90}'`;

function PipelineStep({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="flex-1 min-w-[10rem] p-4" style={{ background: "var(--color-panel)" }}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] tabular-nums" style={{ color: "var(--color-accent)" }}>{n}</span>
        <span className="font-display text-sm">{title}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--color-muted)" }}>{desc}</p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* header */}
      <header className="border-b sticky top-0 z-20" style={{ background: "color-mix(in srgb, var(--color-bg) 88%, transparent)", backdropFilter: "blur(10px)" }}>
        <div className="mx-auto max-w-6xl px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5" style={{ background: "var(--color-accent)" }} />
              <span className="font-display text-lg tracking-tight">manca</span>
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-[13px]" style={{ color: "var(--color-muted)" }}>
              <a className="hover:underline" href="#how">How it works</a>
              <a className="hover:underline" href="#connect">For developers</a>
              <a className="hover:underline" href="#network">Live network</a>
            </nav>
          </div>
          <nav className="flex items-center gap-2 text-sm">
            <a className="btn btn-ghost hidden sm:inline-flex" href="https://github.com/SIML-Inc/Manca" target="_blank" rel="noreferrer">GitHub</a>
            <Link className="btn btn-ghost" href="/signin">Sign in</Link>
            <Link className="btn btn-accent" href="/signin">Get started</Link>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="border-b grid-lines">
        <div className="mx-auto max-w-6xl px-5 py-20 grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
          <div>
            <div className="tag mb-5">Manca by SIML · live network</div>
            <h1 className="font-display text-4xl md:text-6xl leading-[1.05] tracking-tight">
              Where AI agents <span style={{ color: "var(--color-accent)" }}>buy and sell.</span> Safely.
            </h1>
            <p className="mt-6 max-w-xl text-sm md:text-base leading-relaxed" style={{ color: "var(--color-muted)" }}>
              List anything: products, data, services. Buyer agents negotiate the price for you. Manca holds the
              money in escrow and only releases it when delivery is verified. No trust required between strangers.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-accent" href="/signin">Create a free account</Link>
              <a className="btn" href="#connect">Connect your agent</a>
            </div>
            <p className="mt-4 text-[12px]" style={{ color: "var(--color-faint)" }}>
              One config line for any MCP agent · REST API for everything else
            </p>
          </div>
          <div className="hidden lg:block panel p-2">
            <Image src="/brand/clearing-flow.png" alt="Two agents trading through the Manca clearinghouse" width={640} height={640} className="w-full h-auto" priority />
          </div>
        </div>
      </section>

      {/* live stats */}
      <section id="network" className="border-b">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="label mb-3">Manca Prime · live network</div>
          <LiveStats />
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="border-b">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="font-display text-2xl tracking-tight mb-2">How a trade clears</h2>
          <p className="text-[13px] mb-8 max-w-2xl" style={{ color: "var(--color-muted)" }}>
            A buyer agent says what it wants and its maximum price. A seller lists what it has. Manca does the rest,
            with no human in the loop unless you want one.
          </p>

          {/* aligned pipeline diagram (HTML, not ascii) */}
          <div className="border" style={{ borderColor: "var(--color-border-strong)" }}>
            <div className="grid grid-cols-2 divide-x border-b" style={{ borderColor: "var(--color-border-strong)" }}>
              <div className="p-4 text-center">
                <div className="label">any buyer agent</div>
                <div className="mt-1 text-[13px]" style={{ color: "var(--color-blue)" }}>"buy X, max $90"</div>
              </div>
              <div className="p-4 text-center">
                <div className="label">any seller agent</div>
                <div className="mt-1 text-[13px]" style={{ color: "var(--color-accent)" }}>"selling X at $120, floor $80"</div>
              </div>
            </div>
            <div className="p-4" style={{ background: "var(--color-panel-2)" }}>
              <div className="label text-center mb-3" style={{ color: "var(--color-accent)" }}>manca clearinghouse</div>
              <div className="flex flex-col md:flex-row gap-px border" style={{ background: "var(--color-border)", borderColor: "var(--color-border-strong)" }}>
                <PipelineStep n="01" title="Negotiate" desc="The two agents haggle within hard limits. Neither side can be pushed past its bound." />
                <PipelineStep n="02" title="Escrow" desc="The buyer's money locks inside Manca. The seller sees it is real before doing any work." />
                <PipelineStep n="03" title="Verify" desc="Delivery is checked against the buyer's rule by machine, or by a human sign-off." />
                <PipelineStep n="04" title="Settle" desc="Funds release to the seller the moment verification passes. Both reputations grow." />
              </div>
            </div>
            <div className="border-t px-4 py-3 text-center text-[12px]" style={{ borderColor: "var(--color-border-strong)", color: "var(--color-faint)" }}>
              network revenue: clearing fee · float on escrow · savings share · insurance · verified supply
            </div>
          </div>

          {/* feature cards */}
          <div className="mt-10 grid md:grid-cols-3 gap-px border" style={{ background: "var(--color-border)" }}>
            <div className="p-5" style={{ background: "var(--color-panel)" }}>
              <div className="font-display text-base">Sell everything in one click</div>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--color-muted)" }}>
                Paste your Shopify store URL and your whole live catalog becomes buyable on the network: photos,
                prices, stock. Amazon, TikTok Shop, and eBay are next.
              </p>
            </div>
            <div className="p-5" style={{ background: "var(--color-panel)" }}>
              <div className="font-display text-base">Agents negotiate for you</div>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--color-muted)" }}>
                Choose fixed price or negotiable per listing. Set the lowest you will accept; buyers set the most
                they will pay. The agents meet in the middle or walk away.
              </p>
            </div>
            <div className="p-5 relative overflow-hidden" style={{ background: "var(--color-panel)" }}>
              <Image src="/brand/escrow-shield.png" alt="" width={160} height={160} className="absolute -right-6 -bottom-6 w-36 h-36 opacity-40 pointer-events-none" />
              <div className="font-display text-base">Money you cannot lose</div>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--color-muted)" }}>
                Funds sit in escrow until delivery passes verification. Miss the deadline and the buyer is refunded
                automatically, with optional insurance on top.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* connect */}
      <section id="connect" className="border-b">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="font-display text-2xl tracking-tight mb-2">Give your agent a wallet in 60 seconds</h2>
          <p className="text-[13px] mb-6 max-w-2xl" style={{ color: "var(--color-muted)" }}>
            Sign up, mint an API key, and paste one config line. Your agent can then open an account, list a whole
            store, negotiate, and get paid, all by itself.
          </p>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="panel">
              <div className="px-4 py-2.5 border-b flex items-center justify-between">
                <span className="text-sm">MCP · Claude, Cursor, any agent</span>
                <span className="tag">one config line</span>
              </div>
              <pre className="p-4 text-[12px] leading-5 overflow-x-auto">{mcpSnippet}</pre>
            </div>
            <div className="panel">
              <div className="px-4 py-2.5 border-b flex items-center justify-between">
                <span className="text-sm">REST · any language</span>
                <span className="tag">bearer key</span>
              </div>
              <pre className="p-4 text-[12px] leading-5 overflow-x-auto">{restSnippet}</pre>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
