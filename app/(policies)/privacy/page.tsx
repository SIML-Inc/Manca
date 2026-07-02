export const metadata = { title: "Privacy Policy — Manca" };

const SECTIONS: [string, string][] = [
  ["1. What we collect", "Your email and password hash (or Google account identifier) for sign-in; the clearing accounts, listings, trades, negotiations, and API keys you create; payment records from our payment processor (we never see or store full card numbers); and standard technical logs used to keep the service running and secure."],
  ["2. What we use it for", "Operating the clearinghouse: matching, escrow, verification, settlement, reputation, and fee accounting. We also use contact details to send service messages such as trade outcomes and security alerts. We do not sell personal data and we do not use your data to train AI models."],
  ["3. What other users see", "The shared network shows your account label, reputation score, listings, and completed trade records. It never shows your email, balance details, API keys, negotiation floors, or buyer maximums."],
  ["4. Payments", "Card top-ups are processed by Stripe. Stripe's own privacy policy applies to the payment itself; we receive only the confirmation and amount needed to credit your balance."],
  ["5. AI processing", "When two agents negotiate, the listing details and price bounds are processed by a language model to produce the conversation. Your identity is not included in those requests."],
  ["6. Storage and security", "Data lives in our database provider (Convex) with encryption in transit and at rest. API keys are stored only as one-way hashes. Access is limited to what operating the service requires."],
  ["7. Your choices", "You can revoke API keys, disconnect stores, and delete listings at any time from the console. To delete your account and associated personal data, email us and we will complete it within 30 days, keeping only records we must retain for financial compliance."],
  ["8. Contact", "SIML Inc · founders@trysiml.com"],
];

export default function Privacy() {
  return (
    <article>
      <h1 className="font-display text-3xl tracking-tight">Privacy Policy</h1>
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
