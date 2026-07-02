// Shopify connector. Most Shopify storefronts expose their catalog publicly at
// GET https://{shop}/products.json (no auth, page-based pagination), so a seller
// connects in one click by pasting their store URL. No developer app required.
import { categorySlug, type NormalizedProduct } from "./types";

// Accept "brand.com", "https://brand.com/", "store.myshopify.com" -> host only.
export function normalizeShopHost(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\/+$/, "");
  return s;
}

interface ShopifyVariant {
  id: number;
  price: string;
  sku?: string;
  available?: boolean;
  inventory_quantity?: number;
}
interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  product_type?: string;
  vendor?: string;
  images?: { src: string }[];
  variants?: ShopifyVariant[];
}

async function fetchCurrency(host: string): Promise<string> {
  try {
    const res = await fetch(`https://${host}/meta.json`, { headers: { accept: "application/json" } });
    if (res.ok) {
      const j = (await res.json()) as { currency?: string };
      if (j.currency) return j.currency;
    }
  } catch {
    /* fall through */
  }
  return "USD";
}

function variantStock(v: ShopifyVariant): number {
  if (typeof v.inventory_quantity === "number") return Math.max(0, v.inventory_quantity);
  if (v.available === true) return 1;
  if (v.available === false) return 0;
  return 1; // public endpoint often omits stock; assume purchasable
}

// Returns the store's live catalog normalized for Manca. Throws with a clear
// message if the store does not expose a public catalog.
export async function fetchShopifyCatalog(shopUrlRaw: string): Promise<NormalizedProduct[]> {
  const host = normalizeShopHost(shopUrlRaw);
  if (!host || !host.includes(".")) throw new Error(`invalid store URL: "${shopUrlRaw}"`);

  const currency = await fetchCurrency(host);
  const out: NormalizedProduct[] = [];
  const LIMIT = 250;
  const MAX_PAGES = 20;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://${host}/products.json?limit=${LIMIT}&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { accept: "application/json" } });
    } catch (e) {
      throw new Error(`could not reach ${host}: ${(e as Error).message}`);
    }
    if (res.status === 404 || res.status === 401 || res.status === 403)
      throw new Error(`${host} does not expose a public Shopify catalog (HTTP ${res.status}). It may not be a Shopify store, or catalog access is restricted.`);
    if (!res.ok) throw new Error(`${host} returned HTTP ${res.status}`);

    let body: { products?: ShopifyProduct[] };
    try {
      body = (await res.json()) as { products?: ShopifyProduct[] };
    } catch {
      throw new Error(`${host} did not return JSON (not a Shopify storefront?)`);
    }
    const products = body.products ?? [];
    if (products.length === 0) break;

    for (const p of products) {
      const variants = p.variants ?? [];
      const first = variants[0];
      const price = first ? Number(first.price) : NaN;
      if (!Number.isFinite(price) || price <= 0) continue; // skip unpriced items
      const available = variants.reduce((s, v) => s + variantStock(v), 0);
      out.push({
        externalId: String(p.id),
        title: p.title,
        price,
        currency,
        sku: first?.sku || undefined,
        available: available > 0 ? available : 0,
        category: categorySlug(p.product_type || p.vendor || "retail"),
        imageUrl: p.images?.[0]?.src,
        productUrl: `https://${host}/products/${p.handle}`,
      });
    }
    if (products.length < LIMIT) break;
  }

  if (out.length === 0) throw new Error(`no purchasable products found at ${host}`);
  return out;
}
