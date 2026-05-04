import { Result } from "true-myth";
import type { CachePort, GeoPort } from "@/lib/application/ports";
import type { Logger } from "@/lib/infrastructure/logger";
import { GeoResultSchema, type GeoResult } from "@/lib/domain/schemas";
import {
  type IntegrationError,
  httpError,
  permanentError,
  timeoutError,
  transientError,
} from "@/lib/domain/errors";
import { withRetry } from "./_retry";

const ENDPOINT = "https://api.postcodes.io/postcodes";
const TIMEOUT_MS = 3_000;

interface PostcodesIoResult {
  readonly result?: {
    readonly postcode: string;
    readonly latitude: number;
    readonly longitude: number;
    readonly admin_district?: string | null;
    readonly admin_county?: string | null;
    readonly admin_ward?: string | null;
    readonly parish?: string | null;
    readonly country?: string;
  } | null;
}

const fetchWithTimeout = async (url: string): Promise<Result<Response, IntegrationError>> => {
  const controller = new AbortController();
  const started = Date.now();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return Result.ok(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return Result.err(timeoutError(Date.now() - started));
    }
    return Result.err(transientError(error, "postcodes.io fetch failed"));
  } finally {
    clearTimeout(timer);
  }
};

const toGeoResult = (raw: NonNullable<PostcodesIoResult["result"]>): Result<GeoResult, IntegrationError> => {
  const town = raw.admin_district ?? raw.admin_ward ?? raw.parish ?? "";
  const county = raw.admin_county ?? raw.admin_district ?? "";
  const candidate = {
    town,
    county,
    lat: raw.latitude,
    lng: raw.longitude,
  };
  const parsed = GeoResultSchema.safeParse(candidate);
  return parsed.success
    ? Result.ok(parsed.data)
    : Result.err(permanentError(parsed.error, "postcodes.io payload failed schema"));
};

const fetchPostcode = async (
  postcode: string,
): Promise<Result<GeoResult, IntegrationError>> => {
  const url = `${ENDPOINT}/${encodeURIComponent(postcode)}`;
  const responseResult = await fetchWithTimeout(url);
  if (responseResult.isErr) return Result.err(responseResult.error);
  const response = responseResult.value;

  if (response.status === 404) {
    return Result.err(permanentError(`postcode ${postcode} not found`, "postcode not found"));
  }
  if (!response.ok) {
    return Result.err(httpError(response.status, await response.text()));
  }

  let body: PostcodesIoResult;
  try {
    body = (await response.json()) as PostcodesIoResult;
  } catch (error) {
    return Result.err(permanentError(error, "postcodes.io response was not valid JSON"));
  }
  if (body.result === null || body.result === undefined) {
    return Result.err(permanentError(`postcode ${postcode} returned empty result`, "empty result"));
  }
  return toGeoResult(body.result);
};

export const createPostcodesIoAdapter = (
  cache: CachePort,
  logger: Logger,
): GeoPort => {
  return Object.freeze<GeoPort>({
    lookup: async (postcode) => {
      const cached = await cache.getGeo(postcode);
      if (cached.isJust) {
        logger.debug("geo cache hit", { postcode });
        return Result.ok(cached.value);
      }

      const fresh = await withRetry(() => fetchPostcode(postcode));
      if (fresh.isOk) {
        await cache.setGeo(postcode, fresh.value);
        logger.debug("geo fetched", { postcode, town: fresh.value.town });
      } else {
        logger.warn("geo lookup failed", { postcode, error: fresh.error });
      }
      return fresh;
    },
  });
};
