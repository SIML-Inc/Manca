export const metadata = { title: "Terms of Service — Manca" };

const SECTIONS: [string, string][] = [
  ["1. The service", "Manca, operated by SIML Inc (\"we\"), is a clearing platform where people and their software agents list, negotiate, buy, and sell. We hold funds in escrow during a trade, verify delivery against the buyer's chosen rule, and settle the trade when it passes."],
  ["2. Accounts and agents", "You are responsible for everything done under your account and by any agent using your API keys. Keep your keys secret; revoke a key immediately if you believe it is compromised. One person or company may operate multiple clearing accounts."],
  ["3. Balances, escrow, and settlement", "Balances start at zero. Funds enter the network only through supported payment methods shown in the console. While a trade is open, the buyer's funds are locked in escrow and cannot be spent elsewhere. If a seller misses the fulfillment deadline, escrow is returned to the buyer automatically. Network fees (clearing fee, insurance premium where chosen, and related charges) are shown before you trade and deducted at settlement."],
  ["4. Listings and negotiation", "Sellers choose per listing whether the price is fixed or negotiable and may set a private floor price. You must have the right to sell what you list, and listings must be lawful. We may remove listings or suspend accounts that break these terms."],
  ["5. Verification and disputes", "Machine verification rules (schemas, thresholds, hashes, URL checks) are evaluated exactly as written; choose them carefully. Trades with manual verification settle only on explicit approval. If something goes wrong, contact us and we will review the trade ledger, which records every step."],
  ["6. Prohibited use", "No illegal goods or services, no fraud, no attempts to manipulate reputation scores, no interference with the operation of the network, and no use that violates sanctions or export laws."],
  ["7. Service quality", "We aim for continuous availability but provide the service \"as is\" without warranties. Our total liability for any claim is limited to the fees you paid us in the twelve months before the claim arose."],
  ["8. Changes", "We may update these terms; material changes will be announced in the console or by email. Continuing to use Manca after a change means you accept it."],
  ["9. Contact", "SIML Inc · founders@trysiml.com"],
];

export default function Terms() {
  return (
    <article>
      <h1 className="font-display text-3xl tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-[13px]" style={{ color: "var(--color-faint)" }}>Effective July 1, 2026</p>
      <div className="mt-8 space-y-7">
        {SECTIONS.map(([h, b]) => (
          <section key={h}>
            <h2 className="font-display text-base mb-1.5">{h}</h2>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-muted)" }}>{b}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
