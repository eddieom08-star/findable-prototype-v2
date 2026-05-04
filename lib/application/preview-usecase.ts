import { Result } from "true-myth";
import type { Clock, GeoPort } from "./ports";
import type { Logger } from "@/lib/infrastructure/logger";
import {
  PreviewStatus,
  type PreviewRequest,
  type PreviewResponse,
} from "@/lib/domain/schemas";
import type { DomainError } from "@/lib/domain/errors";

export interface PreviewDeps {
  readonly geo: GeoPort;
  readonly logger: Logger;
  readonly clock: Clock;
}

const STUB_LOSS_MONTHLY_GBP = 3_240;

export const runPreview = async (
  input: PreviewRequest,
  deps: PreviewDeps,
  requestId: string,
): Promise<Result<PreviewResponse, DomainError>> => {
  const startedAt = deps.clock.now();

  const geoResult = await deps.geo.lookup(input.postcode);
  if (geoResult.isErr) {
    const err = geoResult.error;
    deps.logger.warn("geo lookup failed", { request_id: requestId, error: err });
    if (err.kind === "permanent") {
      return Result.err({ kind: "validation", issues: [{ path: "postcode", message: "Invalid or unknown UK postcode" }] });
    }
    if (err.kind === "timeout") return Result.err({ kind: "api_timeout", source: "postcodes_io" });
    return Result.err({ kind: "internal", cause: err });
  }
  const geo = geoResult.value;

  const elapsed = Date.now() - startedAt.getTime();
  const asOfDate = startedAt.toISOString().slice(0, 10);

  const response: PreviewResponse = {
    status: PreviewStatus.TEST_DATA,
    business: {
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
    competitors: { top_3: [], current_rank: ">20" },
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
        current_local_pack_rank: null,
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
      api_cost_usd: 0,
      elapsed_ms: elapsed,
      request_id: requestId,
      as_of_date: asOfDate,
    },
    preview_url: null,
  };

  deps.logger.info("preview stub generated", {
    request_id: requestId,
    trade: input.trade,
    town: geo.town,
    elapsed_ms: elapsed,
  });

  return Result.ok(response);
};
