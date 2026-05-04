import type { AppConfig } from "@/lib/infrastructure/config";
import type { Logger } from "@/lib/infrastructure/logger";
import type { CachePort } from "@/lib/application/ports";
import { createUpstashCache } from "./upstash-cache";
import { createMemoryCache } from "./memory-cache";

export const createCache = (
  config: Pick<AppConfig, "KV_REST_API_URL" | "KV_REST_API_TOKEN">,
  logger?: Logger,
): CachePort => {
  if (config.KV_REST_API_URL !== undefined && config.KV_REST_API_TOKEN !== undefined) {
    return createUpstashCache({
      KV_REST_API_URL: config.KV_REST_API_URL,
      KV_REST_API_TOKEN: config.KV_REST_API_TOKEN,
    });
  }
  logger?.warn(
    "KV not configured — using in-memory cache (dev only). Set KV_REST_API_URL + KV_REST_API_TOKEN for persistence.",
  );
  return createMemoryCache();
};
