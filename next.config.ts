import { withBotId } from "botid/next/config";
import { withEve } from "eve/next";
import type { NextConfig } from "next";

// Self-contained: next.config.ts runs as native ESM at build time, so it must
// not import TS domain files from lib/. These flags mirror shopConfig in
// lib/config/index.ts (v1: bot + agent disabled, Shopify optional).
const botIdEnabled = false;
const agentEnabled = false;

function withLocalShopConfig(
  config: NextConfig,
  plugins: readonly unknown[] = [],
): (phase: string, context: unknown) => Promise<NextConfig> {
  return async (phase, context) => {
    const missingShopify = [
      "NEXT_PUBLIC_SHOPIFY_STOREFRONT_ACCESS_TOKEN",
      "NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN",
    ].filter((key) => !process.env[key]);
    if (missingShopify.length > 0) {
      console.warn(
        `What-2-Eat v1 runs without Shopify: missing ${missingShopify.join(", ")}. ` +
          `The /foods catalog works; Shopify routes render empty.`,
      );
    }

    let resolved = config;
    for (const plugin of plugins) {
      if (typeof plugin === "function") {
        resolved = await (
          plugin as (c: NextConfig, p: string, ctx: unknown) => NextConfig | Promise<NextConfig>
        )(resolved, phase, context);
      }
    }
    return resolved;
  };
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    deviceSizes: [1080],
    imageSizes: [],
    minimumCacheTTL: 31536000,
    remotePatterns: [
      {
        hostname: "cdn.shopify.com",
        protocol: "https",
      },
      {
        hostname: "lh3.googleusercontent.com",
        protocol: "https",
      },
    ],
    unoptimized: !!process.env.V0_CALLBACK_URL,
  },
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        as: "*.css",
        loaders: ["@tailwindcss/turbopack"],
      },
    },
  },
  // v1 tech debt (spec §10): the untouched Shopify/Eve layer has pre-existing
  // type errors under TS 7 (Hydrogen gql inference collapses to never), so the
  // production build skips type checking. Our files stay type-clean; run
  // `pnpm typecheck` and filter for lib/foods, components/foods, app/foods.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default withLocalShopConfig(nextConfig, [
  botIdEnabled && withBotId,
  agentEnabled && withEve,
]);
