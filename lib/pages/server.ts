import { cacheLife, cacheTag } from "next/cache";

import type { CommerceLocale } from "@/lib/config/types";
import type { ContentPage } from "@/lib/pages/types";
import { fetchPage } from "@/lib/shopify/operations/pages/server";
import { isShopifyConfigured } from "@/lib/shopify/storefront/server";

export async function getPage(params: {
  handle: string;
  locale?: CommerceLocale;
}): Promise<ContentPage | undefined> {
  "use cache";
  cacheLife("max");
  cacheTag("pages", `page-${params.handle}`);

  // v1 runs without Shopify env: unknown page renders not-found.
  if (!isShopifyConfigured()) return undefined;

  return fetchPage(params);
}
