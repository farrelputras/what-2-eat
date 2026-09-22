import { cacheLife, cacheTag } from "next/cache";

import type { Blog, BlogArticle } from "@/lib/blog/types";
import type { CommerceLocale } from "@/lib/config/types";
import { fetchBlog, fetchBlogArticle } from "@/lib/shopify/operations/blogs/server";
import { isShopifyConfigured } from "@/lib/shopify/storefront/server";

export async function getBlog(params: {
  handle: string;
  limit?: number;
  locale?: CommerceLocale;
}): Promise<Blog | undefined> {
  "use cache";
  cacheLife("max");
  cacheTag("articles", "blogs", `blog-${params.handle}`);

  // v1 runs without Shopify env: unknown blog renders not-found.
  if (!isShopifyConfigured()) return undefined;

  return fetchBlog(params);
}

export async function getBlogArticle(params: {
  articleHandle: string;
  blogHandle: string;
  locale?: CommerceLocale;
}): Promise<BlogArticle | undefined> {
  "use cache";
  cacheLife("max");
  cacheTag(
    "articles",
    "blogs",
    `article-${params.blogHandle}-${params.articleHandle}`,
    `blog-${params.blogHandle}`,
  );

  // v1 runs without Shopify env: unknown article renders not-found.
  if (!isShopifyConfigured()) return undefined;

  return fetchBlogArticle(params);
}
