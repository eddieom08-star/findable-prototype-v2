import { Result } from "true-myth";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { GeoResult, Trade } from "@/lib/domain/schemas";
import type { AppConfig } from "@/lib/infrastructure/config";
import type { Logger } from "@/lib/infrastructure/logger";
import type {
  PlacesBusiness,
  PlacesCompetitor,
  PlacesLookupResult,
  PlacesPort,
} from "@/lib/application/ports";
import {
  type IntegrationError,
  httpError,
  notFoundError,
  permanentError,
  quotaExhaustedError,
  timeoutError,
  transientError,
} from "@/lib/domain/errors";
import { withRetry } from "./_retry";

const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
const SEARCH_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const PLACE_DETAILS_URL_BASE = "https://places.googleapis.com/v1/places";
const PLACE_MEDIA_BASE = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 5_000;
const PHOTO_MAX_WIDTH_PX = 800;
const NEARBY_RADIUS_METERS = 5_000;
const RANK_TOP_LIMIT = 20;
const TOP_COMPETITORS = 3;

const TRADE_INCLUDED_TYPE: Record<Trade, string> = {
  plumber: "plumber",
  electrician: "electrician",
};

interface PlaceV1 {
  readonly id?: string;
  readonly displayName?: { readonly text?: string };
  readonly location?: { readonly latitude?: number; readonly longitude?: number };
  readonly rating?: number;
  readonly userRatingCount?: number;
  readonly photos?: ReadonlyArray<{ readonly name: string }>;
  readonly types?: readonly string[];
  readonly formattedAddress?: string;
  readonly nationalPhoneNumber?: string;
  readonly internationalPhoneNumber?: string;
  readonly websiteUri?: string;
}

interface SearchTextResponse {
  readonly places?: readonly PlaceV1[];
}

interface SearchNearbyResponse {
  readonly places?: readonly PlaceV1[];
}

const fetchWithTimeout = async (
  request: { url: string; init?: RequestInit },
): Promise<Result<Response, IntegrationError>> => {
  const controller = new AbortController();
  const started = Date.now();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(request.url, {
      ...request.init,
      signal: controller.signal,
    });
    return Result.ok(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return Result.err(timeoutError(Date.now() - started));
    }
    return Result.err(transientError(error, "places fetch failed"));
  } finally {
    clearTimeout(timer);
  }
};

const decodeJson = async <T>(response: Response): Promise<Result<T, IntegrationError>> => {
  try {
    return Result.ok((await response.json()) as T);
  } catch (error) {
    return Result.err(permanentError(error, "places response was not valid JSON"));
  }
};

const mapHttpToError = (
  status: number,
  body: string,
  source: string,
): IntegrationError => {
  if (status === 403 || status === 401) return permanentError(body, `${source}: ${status}`);
  if (status === 429) return quotaExhaustedError(source);
  if (status === 404) return notFoundError(`${source}: 404`);
  if (status >= 500) return httpError(status, body);
  return permanentError(body, `${source}: ${status}`);
};

const callGoogle = async <T>(
  request: { url: string; init?: RequestInit; source: string },
): Promise<Result<T, IntegrationError>> => {
  const responseResult = await fetchWithTimeout(request);
  if (responseResult.isErr) return Result.err(responseResult.error);
  const response = responseResult.value;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return Result.err(mapHttpToError(response.status, body, request.source));
  }
  return decodeJson<T>(response);
};

const baseHeaders = (apiKey: string, fieldMask: string): Record<string, string> => ({
  "X-Goog-Api-Key": apiKey,
  "X-Goog-FieldMask": fieldMask,
  "Content-Type": "application/json",
});

const FIND_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
].join(",");

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "rating",
  "userRatingCount",
  "photos",
  "types",
  "formattedAddress",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "location",
].join(",");

const NEARBY_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.rating",
  "places.userRatingCount",
].join(",");

const searchText = async (
  apiKey: string,
  input: { business_name: string; geo: GeoResult },
): Promise<Result<SearchTextResponse, IntegrationError>> => {
  const body = {
    textQuery: `${input.business_name} ${input.geo.town}`,
    locationBias: {
      circle: {
        center: { latitude: input.geo.lat, longitude: input.geo.lng },
        radius: NEARBY_RADIUS_METERS,
      },
    },
    pageSize: 5,
  };
  return callGoogle<SearchTextResponse>({
    url: SEARCH_TEXT_URL,
    init: {
      method: "POST",
      headers: baseHeaders(apiKey, FIND_FIELD_MASK),
      body: JSON.stringify(body),
    },
    source: "search_text",
  });
};

const placeDetails = async (
  apiKey: string,
  placeId: string,
): Promise<Result<PlaceV1, IntegrationError>> => {
  return callGoogle<PlaceV1>({
    url: `${PLACE_DETAILS_URL_BASE}/${encodeURIComponent(placeId)}`,
    init: {
      method: "GET",
      headers: baseHeaders(apiKey, DETAILS_FIELD_MASK),
    },
    source: "place_details",
  });
};

const searchNearby = async (
  apiKey: string,
  geo: GeoResult,
  trade: Trade,
): Promise<Result<SearchNearbyResponse, IntegrationError>> => {
  const body = {
    includedTypes: [TRADE_INCLUDED_TYPE[trade]],
    maxResultCount: RANK_TOP_LIMIT,
    rankPreference: "POPULARITY",
    locationRestriction: {
      circle: {
        center: { latitude: geo.lat, longitude: geo.lng },
        radius: NEARBY_RADIUS_METERS,
      },
    },
  };
  return callGoogle<SearchNearbyResponse>({
    url: SEARCH_NEARBY_URL,
    init: {
      method: "POST",
      headers: baseHeaders(apiKey, NEARBY_FIELD_MASK),
      body: JSON.stringify(body),
    },
    source: "search_nearby",
  });
};

const buildPhotoUrl = (apiKey: string, photoName: string): string => {
  const params = new URLSearchParams({ maxWidthPx: String(PHOTO_MAX_WIDTH_PX), key: apiKey });
  return `${PLACE_MEDIA_BASE}/${photoName}/media?${params.toString()}`;
};

const normalisePhoneToE164 = (raw: string | undefined | null): string | null => {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  const parsed = parsePhoneNumberFromString(raw, "GB");
  return parsed === undefined ? null : parsed.format("E.164");
};

const pickCandidate = (
  candidates: readonly PlaceV1[],
  userPhone: string,
): PlaceV1 | null => {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null;
  const userE164 = normalisePhoneToE164(userPhone);
  if (userE164 !== null) {
    for (const c of candidates) {
      const candidateE164 = normalisePhoneToE164(
        c.internationalPhoneNumber ?? c.nationalPhoneNumber ?? null,
      );
      if (candidateE164 !== null && candidateE164 === userE164) return c;
    }
  }
  return candidates[0] ?? null;
};

const buildBusiness = (apiKey: string, details: PlaceV1): PlacesBusiness | null => {
  if (details.id === undefined) return null;
  const photos = (details.photos ?? [])
    .slice(0, 6)
    .map((p) => buildPhotoUrl(apiKey, p.name));
  return {
    place_id: details.id,
    name: details.displayName?.text ?? "",
    rating: details.rating ?? null,
    review_count: details.userRatingCount ?? null,
    photos,
    formatted_address: details.formattedAddress ?? null,
    formatted_phone:
      details.nationalPhoneNumber ?? details.internationalPhoneNumber ?? null,
    website: details.websiteUri ?? null,
    business_types: details.types ?? [],
    lat: details.location?.latitude ?? 0,
    lng: details.location?.longitude ?? 0,
  };
};

const findRankAndCompetitors = (
  ourPlaceId: string,
  results: readonly PlaceV1[],
): { rank: number | ">20"; competitors: readonly PlacesCompetitor[] } => {
  const top = results.slice(0, RANK_TOP_LIMIT);
  const ourIdx = top.findIndex((p) => p.id === ourPlaceId);
  const rank: number | ">20" = ourIdx === -1 ? ">20" : ourIdx + 1;
  const competitors: PlacesCompetitor[] = [];
  for (const p of top) {
    if (competitors.length >= TOP_COMPETITORS) break;
    if (p.id === ourPlaceId) continue;
    competitors.push({
      name: p.displayName?.text ?? "",
      rating: p.rating ?? null,
      review_count: p.userRatingCount ?? null,
    });
  }
  return { rank, competitors };
};

export const createPlacesAdapter = (
  config: Pick<AppConfig, "GOOGLE_PLACES_API_KEY">,
  logger: Logger,
): PlacesPort => {
  const apiKey = config.GOOGLE_PLACES_API_KEY;
  if (apiKey === undefined) {
    return Object.freeze<PlacesPort>({
      lookupBusinessAndCompetitors: async () => {
        logger.error("places adapter called but GOOGLE_PLACES_API_KEY is unset");
        return Result.err(permanentError("api key missing", "GOOGLE_PLACES_API_KEY"));
      },
    });
  }

  const lookup: PlacesPort["lookupBusinessAndCompetitors"] = async (input) => {
    const findResult = await withRetry(() => searchText(apiKey, input));
    if (findResult.isErr) return Result.err(findResult.error);
    const candidates = findResult.value.places ?? [];
    const candidate = pickCandidate(candidates, input.phone);
    if (candidate === null || candidate.id === undefined) {
      return Result.err(notFoundError("no place candidate"));
    }

    const [detailsResult, nearbyResult] = await Promise.all([
      withRetry(() => placeDetails(apiKey, candidate.id!)),
      withRetry(() => searchNearby(apiKey, input.geo, input.trade)),
    ]);

    if (detailsResult.isErr) return Result.err(detailsResult.error);
    const business = buildBusiness(apiKey, detailsResult.value);
    if (business === null) return Result.err(notFoundError("place_details missing id"));

    if (nearbyResult.isErr) return Result.err(nearbyResult.error);
    const nearbyResults = nearbyResult.value.places ?? [];
    const { rank, competitors } = findRankAndCompetitors(business.place_id, nearbyResults);

    const lookupResult: PlacesLookupResult = { business, competitors, current_rank: rank };
    logger.debug("places lookup ok", {
      place_id: business.place_id,
      current_rank: rank,
      photo_count: business.photos.length,
      candidates: candidates.length,
    });
    return Result.ok(lookupResult);
  };

  return Object.freeze<PlacesPort>({ lookupBusinessAndCompetitors: lookup });
};
