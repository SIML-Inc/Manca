// A platform-agnostic product, normalized from any storefront connector into
// the shape Manca posts as a sell-offer.
export interface NormalizedProduct {
  externalId: string; // stable id on the source platform (for resync dedupe)
  title: string;
  price: number; // in the store's currency, taken as the settlement amount
  currency: string;
  sku?: string;
  available: number; // units in stock (0 = out of stock -> inactive offer)
  category: string; // free-form; buyers match offers by this
  imageUrl?: string;
  productUrl?: string;
}

export type Platform = "shopify" | "amazon" | "tiktok" | "ebay" | "woocommerce";

// Normalize an arbitrary product-type / department string into a tidy,
// lowercased category slug so buyer mandates can match on it.
export function categorySlug(raw: string | undefined | null): string {
  const s = (raw ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "general-merchandise";
}
