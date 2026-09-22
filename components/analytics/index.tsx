import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { getShopAnalytics } from "@/lib/analytics/server";
import { shopConfig } from "@/lib/config";

import { ShopifyScriptsTracker } from "./shopify-client";

export async function AnalyticsComponents() {
  // v1 runs without Shopify env: skip the Shopify tracker when the shop is unreachable.
  const shop = await getShopAnalytics({});
  return (
    <>
      {shopConfig.analytics.vercel.isEnabled && <Analytics />}
      {shopConfig.analytics.speedInsights.isEnabled && <SpeedInsights />}
      {shop && (
        <ShopifyScriptsTracker
          shop={shop}
          storefrontId={process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_ID ?? ""}
        />
      )}
    </>
  );
}
