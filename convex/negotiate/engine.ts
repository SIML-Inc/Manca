// Deterministic bounded negotiation. Guarantees a fair outcome inside the zone
// of possible agreement (buyer's ceiling >= seller's floor) and is the fallback
// when the LLM negotiator is unavailable or returns something out of bounds.

export interface Round {
  actor: "buyer" | "seller";
  price: number;
  message: string;
}
export interface NegotiationResult {
  rounds: Round[];
  status: "agreed" | "failed";
  agreedPrice?: number;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
function money(n: number): string {
  return "$" + r2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function negotiateDeterministic(listPrice: number, floorPrice: number, buyerMax: number): NegotiationResult {
  const rounds: Round[] = [];
  rounds.push({ actor: "seller", price: r2(listPrice), message: `Listed at ${money(listPrice)}.` });

  // No overlap: the buyer cannot reach the seller's floor.
  if (buyerMax < floorPrice) {
    rounds.push({ actor: "buyer", price: r2(buyerMax), message: `My ceiling is ${money(buyerMax)}. Can you meet it?` });
    rounds.push({ actor: "seller", price: r2(floorPrice), message: `I can't go below ${money(floorPrice)}. No deal.` });
    return { rounds, status: "failed" };
  }

  const ceiling = Math.min(listPrice, buyerMax);
  const agreed = r2((ceiling + floorPrice) / 2);
  const open = r2(Math.max(floorPrice, buyerMax * 0.8));
  const counter = r2((listPrice + agreed) / 2);

  rounds.push({ actor: "buyer", price: open, message: `I can start at ${money(open)}; my ceiling is ${money(buyerMax)}.` });
  rounds.push({ actor: "seller", price: counter, message: `I'll come down to ${money(counter)}.` });
  rounds.push({ actor: "buyer", price: agreed, message: `Let's meet at ${money(agreed)}.` });
  rounds.push({ actor: "seller", price: agreed, message: `Deal at ${money(agreed)}.` });
  return { rounds, status: "agreed", agreedPrice: agreed };
}

// Clamp any (e.g. LLM-produced) outcome to the hard bounds so an agent can never
// pay above its ceiling nor a seller sell below its floor.
export function clampOutcome(
  result: NegotiationResult,
  floorPrice: number,
  buyerMax: number,
): NegotiationResult {
  if (result.status !== "agreed" || result.agreedPrice === undefined) return result;
  const p = result.agreedPrice;
  if (p < floorPrice || p > buyerMax) {
    // Out of bounds -> not a valid deal; snap to the midpoint if a ZOPA exists.
    if (buyerMax >= floorPrice) return { ...result, agreedPrice: r2((Math.min(buyerMax, p < floorPrice ? buyerMax : p) + floorPrice) / 2) };
    return { rounds: result.rounds, status: "failed" };
  }
  return { ...result, agreedPrice: r2(p) };
}
