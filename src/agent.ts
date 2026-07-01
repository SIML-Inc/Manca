// The Manca Agent SDK. A developer wraps any agent (buyer or seller — the same
// object does both) in one Agent, then posts signed mandates/offers. This is
// the "one connection, both sides" primitive.
import { newKeyPair, signPayload } from "./core/crypto.ts";
import {
  Clearinghouse,
  canonicalMandate,
  canonicalOffer,
} from "./core/clearinghouse.ts";
import type { BuyMandateInput, SellOfferInput } from "./core/clearinghouse.ts";
import type { Account, BuyMandate, SellOffer, Trade, VerificationRule } from "./types.ts";

export class Agent {
  hub: Clearinghouse;
  account: Account;
  private privateKey: string;

  constructor(hub: Clearinghouse, label: string) {
    const kp = newKeyPair();
    this.hub = hub;
    this.privateKey = kp.privateKey;
    this.account = hub.register(label, kp.publicKey);
  }

  get id(): string {
    return this.account.id;
  }

  deposit(amount: number): this {
    this.hub.deposit(this.id, amount);
    return this;
  }

  becomeVerifiedSupplier(): this {
    this.hub.enableVerifiedSupplier(this.id);
    return this;
  }

  // --- buyer side ---
  buy(input: Omit<BuyMandateInput, "buyerId">): BuyMandate {
    const full: BuyMandateInput = { ...input, buyerId: this.id };
    const sig = signPayload(this.privateKey, canonicalMandate(full));
    return this.hub.postBuyMandate(full, sig);
  }

  // --- seller side (same agent) ---
  sell(input: Omit<SellOfferInput, "sellerId">): SellOffer {
    const full: SellOfferInput = { ...input, sellerId: this.id };
    const sig = signPayload(this.privateKey, canonicalOffer(full));
    return this.hub.postSellOffer(full, sig);
  }

  fulfill(tradeId: string, payload: unknown): Promise<{ trade: Trade; verdict: unknown }> {
    return this.hub.submitFulfillment(tradeId, payload);
  }

  view() {
    return this.hub.accountView(this.id);
  }
}

export type { VerificationRule };
