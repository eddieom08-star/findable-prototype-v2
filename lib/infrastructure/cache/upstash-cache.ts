import { Redis } from "@upstash/redis";
import { Maybe } from "true-myth";
import type { AppConfig } from "@/lib/infrastructure/config";
import type { CachePort } from "@/lib/application/ports";
import type {
  GeoResult,
  KeywordVolume,
  PreviewResponse,
  Trade,
} from "@/lib/domain/schemas";
import {
  TTL_GEO_SECONDS,
  TTL_PREVIEW_SECONDS,
  TTL_VOLUME_SECONDS,
  cacheKey,
} from "./keys";

const wrap = <T extends NonNullable<unknown>>(value: T | null): Maybe<T> =>
  Maybe.of(value);

type UpstashConfig = Pick<AppConfig, "KV_REST_API_URL" | "KV_REST_API_TOKEN">;

export const createUpstashCache = (config: UpstashConfig): CachePort => {
  const redis = new Redis({
    url: config.KV_REST_API_URL,
    token: config.KV_REST_API_TOKEN,
  });

  return Object.freeze<CachePort>({
    getPreview: async (businessName, postcode) =>
      wrap(await redis.get<PreviewResponse>(cacheKey.preview(businessName, postcode))),

    setPreview: async (businessName, postcode, payload) => {
      await redis.set(cacheKey.preview(businessName, postcode), payload, {
        ex: TTL_PREVIEW_SECONDS,
      });
    },

    getVolume: async (trade: Trade, town) =>
      wrap(await redis.get<readonly KeywordVolume[]>(cacheKey.volume(trade, town))),

    setVolume: async (trade: Trade, town, payload) => {
      await redis.set(cacheKey.volume(trade, town), payload, {
        ex: TTL_VOLUME_SECONDS,
      });
    },

    getGeo: async (postcode) =>
      wrap(await redis.get<GeoResult>(cacheKey.geo(postcode))),

    setGeo: async (postcode, payload) => {
      await redis.set(cacheKey.geo(postcode), payload, { ex: TTL_GEO_SECONDS });
    },
  });
};
