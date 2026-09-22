import { cacheLife, cacheTag } from "next/cache";

import type { CommerceLocale } from "@/lib/config/types";
import type { PageInfo } from "@/lib/pagination/types";
import type {
  ProductCard,
  ProductDetails,
  ProductVariant,
  SelectedOption,
} from "@/lib/product/types";
import { getNumericShopifyId } from "@/lib/shopify/id/server";
import {
  fetchComplementaryProducts,
  fetchProduct,
  fetchProducts,
  fetchProductsByIds,
  fetchProductVariant,
  fetchRelatedProducts,
  fetchSearchIndexProducts,
} from "@/lib/shopify/operations/products/server";
import type {
  ProductsParams,
  ProductsResult,
  SearchIndexProductsParams,
  SearchIndexProductsResult,
} from "@/lib/shopify/operations/products/types";
import { isShopifyConfigured } from "@/lib/shopify/storefront/server";

const EMPTY_PAGE_INFO: PageInfo = {
  endCursor: null,
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
};

// Only valid inside a "use cache" scope.
export function tagProducts(products: Array<{ id: string }>): void {
  for (const product of products) {
    const numericId = getNumericShopifyId(product.id);
    if (numericId) cacheTag(`product-${numericId}`);
  }
}

export async function getProduct(params: {
  handle: string;
  locale?: CommerceLocale;
}): Promise<ProductDetails | undefined> {
  "use cache";
  cacheLife("max");
  cacheTag("products", `product-${params.handle}`);

  // v1 runs without Shopify env: unknown product renders not-found.
  if (!isShopifyConfigured()) return undefined;

  const product = await fetchProduct(params);
  if (product) tagProducts([product]);
  return product;
}

export async function getProductVariant(params: {
  handle: string;
  locale?: CommerceLocale;
  selectedOptions: SelectedOption[];
}): Promise<ProductVariant | undefined> {
  // Uncached: the selected variant's price and stock are read live per request, and caching per option combination multiplies entries by variant count.
  // v1 runs without Shopify env: no variant to resolve.
  if (!isShopifyConfigured()) return undefined;

  return fetchProductVariant(params);
}

export async function getProducts(params: ProductsParams): Promise<ProductsResult> {
  "use cache: remote";
  cacheLife("max");
  cacheTag("products");

  // v1 runs without Shopify env: grids render empty.
  if (!isShopifyConfigured()) return { pageInfo: EMPTY_PAGE_INFO, products: [] };

  const result = await fetchProducts(params);
  tagProducts(result.products);
  return result;
}

// Cursor-paginated browse reads stay uncached in lib/collections/server.ts; this serves fixed grids only.
export async function getSearchIndexProducts(
  params: SearchIndexProductsParams,
): Promise<SearchIndexProductsResult> {
  "use cache: remote";
  cacheLife("max");
  cacheTag("products");

  // v1 runs without Shopify env: grids render empty.
  if (!isShopifyConfigured()) return { pageInfo: EMPTY_PAGE_INFO, products: [], total: 0 };

  const result = await fetchSearchIndexProducts(params);
  tagProducts(result.products);
  return result;
}

export async function getComplementaryProducts(params: {
  handle: string;
  locale?: CommerceLocale;
}): Promise<ProductCard[]> {
  "use cache: remote";
  cacheLife("max");
  cacheTag("products", `recommendations-${params.handle}`);

  // v1 runs without Shopify env: no recommendations.
  if (!isShopifyConfigured()) return [];

  const products = await fetchComplementaryProducts(params);
  tagProducts(products);
  return products;
}

export async function getRelatedProducts(params: {
  handle: string;
  locale?: CommerceLocale;
}): Promise<ProductCard[]> {
  "use cache: remote";
  cacheLife("max");
  cacheTag("products", `recommendations-${params.handle}`);

  // v1 runs without Shopify env: no recommendations.
  if (!isShopifyConfigured()) return [];

  const products = await fetchRelatedProducts(params);
  tagProducts(products);
  return products;
}

export async function getProductsByIds(params: {
  ids: string[];
  locale?: CommerceLocale;
}): Promise<ProductCard[]> {
  "use cache: remote";
  cacheLife("max");
  cacheTag("products");

  // v1 runs without Shopify env: nothing to resolve.
  if (!isShopifyConfigured()) return [];

  const products = await fetchProductsByIds(params);
  tagProducts(products);
  return products;
}
