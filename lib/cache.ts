import { Redis } from "@upstash/redis";
import type { PreviewResponse } from "./schemas";

const TTL_PREVIEW_SECONDS = 14 * 24 * 60 * 60;
const TTL_VOLUME_SECONDS = 30 * 24 * 60 * 60;

let _client: Redis | null = null;

function client(): Redis {
  if (_client) return _client;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "KV_REST_API_URL / KV_REST_API_TOKEN missing. Provision Vercel KV and run `vercel env pull .env.local`.",
    );
  }
  _client = new Redis({ url, token });
  return _client;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalisePostcode(postcode: string): string {
  const cleaned = postcode.toUpperCase().replace(/\s+/g, "");
  return cleaned.length >= 5
    ? `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`
    : cleaned;
}

export function normaliseTown(town: string): string {
  return town.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export const cacheKey = {
  preview: (businessName: string, postcode: string) =>
    `preview:${slugify(businessName)}:${normalisePostcode(postcode)}`,
  volume: (trade: string, town: string) =>
    `volume:${trade.toLowerCase()}:${normaliseTown(town)}`,
  geo: (postcode: string) => `geo:${normalisePostcode(postcode)}`,
};

export interface KeywordVolume {
  keyword: string;
  volume: number;
}

export interface GeoResult {
  town: string;
  county: string;
  lat: number;
  lng: number;
}

export const cache = {
  async getPreview(businessName: string, postcode: string): Promise<PreviewResponse | null> {
    return (await client().get<PreviewResponse>(cacheKey.preview(businessName, postcode))) ?? null;
  },
  async setPreview(
    businessName: string,
    postcode: string,
    payload: PreviewResponse,
  ): Promise<void> {
    await client().set(cacheKey.preview(businessName, postcode), payload, {
      ex: TTL_PREVIEW_SECONDS,
    });
  },

  async getVolume(trade: string, town: string): Promise<KeywordVolume[] | null> {
    return (await client().get<KeywordVolume[]>(cacheKey.volume(trade, town))) ?? null;
  },
  async setVolume(trade: string, town: string, payload: KeywordVolume[]): Promise<void> {
    await client().set(cacheKey.volume(trade, town), payload, { ex: TTL_VOLUME_SECONDS });
  },

  async getGeo(postcode: string): Promise<GeoResult | null> {
    return (await client().get<GeoResult>(cacheKey.geo(postcode))) ?? null;
  },
  async setGeo(postcode: string, payload: GeoResult): Promise<void> {
    await client().set(cacheKey.geo(postcode), payload);
  },
};
