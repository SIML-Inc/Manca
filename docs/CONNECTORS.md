# Storefront connectors

Manca lets a seller link a real store so its live catalog becomes machine-verifiable
**sell-offers** on the clearing network. Any buyer agent can then purchase those goods
with escrow + settlement.

## Shopify — live, one click, no approval

Most Shopify storefronts publish their catalog at `GET https://{store}/products.json`
(no auth). The seller pastes their store URL and Manca imports the catalog. Nothing to
register. If a store has disabled that endpoint (password page, or a theme/app that blocks
it), the connect call returns a clear error and the seller must use an Admin API token
instead (future work).

- Endpoint: `https://{store}/products.json?limit=250&page=N`
- Currency: read from `https://{store}/meta.json`
- Mapping: `variants[0].price` → offer price, `available`/`inventory_quantity` → stock,
  `product_type` → category, `images[0].src` → image.

## Amazon, TikTok Shop, eBay — need a registered developer app

These platforms do not expose a public catalog. Before a seller can connect, we must
register a developer app on each platform and set its credentials on the Convex
deployment (`npx convex env set …`). Then the seller completes a one-click OAuth.

| Platform | Register at | Env vars | Catalog endpoint |
|---|---|---|---|
| Amazon SP-API | Seller Central → Develop apps (roles: Product Listing / Inventory) | `AMAZON_SP_CLIENT_ID`, `AMAZON_SP_CLIENT_SECRET` | `GET /listings/2021-08-01/items/{sellerId}/{sku}` · `GET /fba/inventory/v1/summaries` (host `sellingpartnerapi-na.amazon.com`, header `x-amz-access-token`) |
| TikTok Shop | Partner Center → create app + Product scope | `TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET` | `POST /product/202309/products/search` (host `open-api.tiktokglobalshop.com`, signed + `x-tts-access-token`) |
| eBay | developer.ebay.com → app keyset | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | `GET /sell/inventory/v1/inventory_item` (+ `/offer` for price) · public search via `GET /buy/browse/v1/item_summary/search` |

Once the env vars are present, the corresponding `connect*` action stops returning the
"needs a developer app" error and runs the real OAuth + import. Each adapter normalizes
into the same `NormalizedProduct` shape as Shopify (`convex/connectors/types.ts`), so the
rest of the pipeline is identical.
