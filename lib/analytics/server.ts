import { cacheLife, cacheTag } from "next/cache";

import type { ShopAnalyticsData } from "@/lib/analytics/types";
import type { CommerceLocale } from "@/lib/config/types";
import { fetchShopAnalytics } from "@/lib/shopify/operations/shop/server";
import { isShopifyConfigured } from "@/lib/shopify/storefront/server";

export async function getShopAnalytics(
  params: { locale?: CommerceLocale } = {},
): Promise<ShopAnalyticsData | null> {
  "use cache";
  cacheLife("max");
  cacheTag("shop-analytics");

  // v1 runs without Shopify env: callers skip Shopify-backed trackers when null.
  if (!isShopifyConfigured()) return null;

  return fetchShopAnalytics(params);
}
