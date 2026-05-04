import { Maybe } from "true-myth";
import type { CachePort } from "@/lib/application/ports";
import type {
  GeoResult,
  KeywordVolume,
  PreviewResponse,
  Trade,
} from "@/lib/domain/schemas";
import { cacheKey } from "./keys";

interface Entry {
  readonly value: unknown;
  readonly expiresAt: number;
}

const NEVER = Number.POSITIVE_INFINITY;

export const createMemoryCache = (): CachePort => {
  const store = new Map<string, Entry>();

  const get = <T extends NonNullable<unknown>>(key: string): Maybe<T> => {
    const entry = store.get(key);
    if (entry === undefined) return Maybe.nothing<T>();
    if (entry.expiresAt < Date.now()) {
      store.delete(key);
      return Maybe.nothing<T>();
    }
    return Maybe.of(entry.value as T | null | undefined);
  };

  const set = (key: string, value: unknown, ttlSeconds: number): void => {
    const expiresAt = ttlSeconds === Number.POSITIVE_INFINITY ? NEVER : Date.now() + ttlSeconds * 1000;
    store.set(key, { value, expiresAt });
  };

  return Object.freeze<CachePort>({
    getPreview: async (businessName, postcode) =>
      get<PreviewResponse>(cacheKey.preview(businessName, postcode)),
    setPreview: async (businessName, postcode, payload) => {
      set(cacheKey.preview(businessName, postcode), payload, 14 * 24 * 60 * 60);
    },
    getVolume: async (trade: Trade, town) =>
      get<readonly KeywordVolume[]>(cacheKey.volume(trade, town)),
    setVolume: async (trade: Trade, town, payload) => {
      set(cacheKey.volume(trade, town), payload, 30 * 24 * 60 * 60);
    },
    getGeo: async (postcode) => get<GeoResult>(cacheKey.geo(postcode)),
    setGeo: async (postcode, payload) => {
      set(cacheKey.geo(postcode), payload, 365 * 24 * 60 * 60);
    },
  });
};
