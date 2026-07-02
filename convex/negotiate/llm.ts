// LLM-driven negotiation via OpenRouter (default model GLM-4.6). Two agents
// haggle over one item within hard bounds. Returns a transcript + agreed price,
// or throws so the caller falls back to the deterministic engine.
import type { NegotiationResult, Round } from "./engine";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

interface Params {
  title: string;
  category: string;
  listPrice: number;
  floorPrice: number; // seller's secret minimum
  buyerMax: number; // buyer's secret ceiling
  buyerStyle?: string;
  sellerStyle?: string;
}

export async function negotiateWithLLM(p: Params): Promise<NegotiationResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("no OPENROUTER_API_KEY");
  const model = process.env.NEGOTIATION_MODEL || "z-ai/glm-4.6";

  const system =
    "You simulate a realistic price negotiation between two autonomous commerce agents: a BUYER agent and a SELLER agent, over a single item. " +
    "Alternate turns starting with the seller. Each turn states a price and one short line of reasoning. " +
    "HARD RULES you must never break: the buyer never proposes or accepts a price above its ceiling; the seller never proposes or accepts a price below its floor. " +
    "Converge in 3 to 6 total turns. If the buyer's ceiling is below the seller's floor, there is no deal (status 'failed'). " +
    "Keep each message under 140 characters. Do not use em dashes or en dashes. " +
    "Respond ONLY with strict JSON matching: {\"rounds\":[{\"actor\":\"buyer\"|\"seller\",\"price\":number,\"message\":string}],\"status\":\"agreed\"|\"failed\",\"agreedPrice\":number|null}.";

  const user = JSON.stringify({
    item: p.title || p.category,
    category: p.category,
    sellerListPrice: p.listPrice,
    sellerFloorPrice: p.floorPrice,
    buyerCeiling: p.buyerMax,
    buyerStyle: p.buyerStyle ?? "pragmatic, wants a fair discount",
    sellerStyle: p.sellerStyle ?? "protects margin but wants the sale",
  });

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://trymanca.ai",
      "X-Title": "Manca Negotiation",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty completion");

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("non-JSON completion");
  }

  const rounds: Round[] = Array.isArray(parsed.rounds)
    ? parsed.rounds
        .filter((r: any) => (r?.actor === "buyer" || r?.actor === "seller") && typeof r.price === "number")
        .map((r: any) => ({ actor: r.actor, price: Math.round(r.price * 100) / 100, message: String(r.message ?? "").slice(0, 200) }))
    : [];
  if (rounds.length === 0) throw new Error("no rounds in completion");

  const status = parsed.status === "agreed" ? "agreed" : parsed.status === "failed" ? "failed" : undefined;
  if (!status) throw new Error("bad status");
  const agreedPrice = typeof parsed.agreedPrice === "number" ? Math.round(parsed.agreedPrice * 100) / 100 : undefined;

  return { rounds, status, agreedPrice };
}
