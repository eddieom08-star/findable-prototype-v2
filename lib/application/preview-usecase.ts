import { Result } from "true-myth";
import type { Clock, GeoPort, PlacesPort, PlacesLookupResult } from "./ports";
import type { Logger } from "@/lib/infrastructure/logger";
import {
  PreviewStatus,
  type PreviewRequest,
  type PreviewResponse,
} from "@/lib/domain/schemas";
import type { DomainError, IntegrationError } from "@/lib/domain/errors";

export interface PreviewDeps {
  readonly geo: GeoPort;
  readonly places: PlacesPort;
  readonly logger: Logger;
  readonly clock: Clock;
}

const PLACES_API_COST_USD = 0.066;
const STUB_LOSS_MONTHLY_GBP = 3_240;

const integrationToDomain = (
  err: IntegrationError,
  source: "places" | "postcodes_io",
): DomainError => {
  switch (err.kind) {
    case "not_found":
      return source === "places"
        ? { kind: "business_not_found" }
        : { kind: "validation", issues: [{ path: "postcode", message: "Invalid or unknown UK postcode" }] };
    case "quota_exhausted":
      return { kind: "api_quota_exhausted", source: source === "places" ? "places" : "dataforseo" };
    case "timeout":
      return { kind: "api_timeout", source };
    case "permanent":
      return source === "postcodes_io"
        ? { kind: "validation", issues: [{ path: "postcode", message: "Invalid or unknown UK postcode" }] }
        : { kind: "internal", cause: err };
    case "transient":
    case "http":
      return { kind: "internal", cause: err };
  }
};

export const runPreview = async (
  input: PreviewRequest,
  deps: PreviewDeps,
  requestId: string,
): Promise<Result<PreviewResponse, DomainError>> => {
  const startedAt = deps.clock.now();

  const geoResult = await deps.geo.lookup(input.postcode);
  if (geoResult.isErr) {
    deps.logger.warn("geo lookup failed", { request_id: requestId, error: geoResult.error });
    return Result.err(integrationToDomain(geoResult.error, "postcodes_io"));
  }
  const geo = geoResult.value;

  const placesResult = await deps.places.lookupBusinessAndCompetitors({
    business_name: input.business_name,
    phone: input.phone,
    trade: input.trade,
    geo,
  });

  let placesData: PlacesLookupResult | null = null;
  let placesCostUsd = 0;
  if (placesResult.isOk) {
    placesData = placesResult.value;
    placesCostUsd = PLACES_API_COST_USD;
  } else {
    deps.logger.warn("places lookup failed", { request_id: requestId, error: placesResult.error });
    if (placesResult.error.kind !== "not_found") {
      return Result.err(integrationToDomain(placesResult.error, "places"));
    }
  }

  const elapsed = Date.now() - startedAt.getTime();
  const asOfDate = startedAt.toISOString().slice(0, 10);

  const status = placesData === null ? PreviewStatus.NO_GBP : PreviewStatus.TEST_DATA;

  const response: PreviewResponse = {
    status,
    business: placesData
      ? {
          name: placesData.business.name,
          place_id: placesData.business.place_id,
          rating: placesData.business.rating,
          review_count: placesData.business.review_count,
          photos: [...placesData.business.photos],
          formatted_address: placesData.business.formatted_address,
          formatted_phone: placesData.business.formatted_phone,
          website: placesData.business.website,
          business_types: [...placesData.business.business_types],
        }
      : {
          name: input.business_name,
          place_id: null,
          rating: null,
          review_count: null,
          photos: [],
          formatted_address: null,
          formatted_phone: null,
          website: input.website ?? null,
          business_types: [input.trade],
        },
    geo,
    competitors: {
      top_3: placesData
        ? placesData.competitors.map((c) => ({
            name: c.name,
            rating: c.rating,
            review_count: c.review_count,
          }))
        : [],
      current_rank: placesData?.current_rank ?? ">20",
    },
    search: {
      total_monthly_volume: 0,
      keyword_breakdown: [],
      volume_source: "fallback",
    },
    loss: {
      monthly_pounds: STUB_LOSS_MONTHLY_GBP,
      annual_pounds: STUB_LOSS_MONTHLY_GBP * 12,
      recoverable_clicks_per_month: 0,
      formula_inputs: {
        total_searches: 0,
        current_local_pack_rank: typeof placesData?.current_rank === "number" ? placesData.current_rank : null,
        current_organic_rank: null,
        target_ctr: 0.1,
        current_ctr: 0,
        gap_ctr: 0.1,
        conversion_rate: 0.35,
        avg_job_value: input.avg_job_value,
      },
      capped: false,
    },
    meta: {
      cached: false,
      api_cost_usd: placesCostUsd,
      elapsed_ms: elapsed,
      request_id: requestId,
      as_of_date: asOfDate,
    },
    preview_url: null,
  };

  deps.logger.info("preview generated", {
    request_id: requestId,
    trade: input.trade,
    town: geo.town,
    elapsed_ms: elapsed,
    status,
    current_rank: placesData?.current_rank,
    api_cost_usd: placesCostUsd,
  });

  return Result.ok(response);
};
