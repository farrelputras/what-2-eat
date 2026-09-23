import { assertBypassAllowed } from "@/lib/firebase/admin";
import { configureShopifyLogging } from "@/lib/shopify/logging/server";

export function register() {
  assertBypassAllowed();
  configureShopifyLogging();
}
