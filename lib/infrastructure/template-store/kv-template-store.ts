import { Redis } from "@upstash/redis";
import { Maybe } from "true-myth";
import type { TemplateStorePort } from "@/lib/application/ports";
import type { AppConfig } from "@/lib/infrastructure/config";

const TTL_SECONDS = 14 * 24 * 60 * 60;
const KEY_PREFIX = "preview_html:";

export const createKvTemplateStore = (
  config: Pick<AppConfig, "KV_REST_API_URL" | "KV_REST_API_TOKEN">,
): TemplateStorePort => {
  const redis = new Redis({
    url: config.KV_REST_API_URL ?? "",
    token: config.KV_REST_API_TOKEN ?? "",
  });

  return Object.freeze<TemplateStorePort>({
    put: async (slug, html) => {
      await redis.set(`${KEY_PREFIX}${slug}`, html, { ex: TTL_SECONDS });
    },
    get: async (slug) => {
      const value = await redis.get<string>(`${KEY_PREFIX}${slug}`);
      return value === null || value === undefined ? Maybe.nothing<string>() : Maybe.just(value);
    },
  });
};
