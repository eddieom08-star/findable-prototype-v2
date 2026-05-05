import { Result } from "true-myth";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type {
  CachePort,
  Clock,
  GeoPort,
  KeywordVolumePort,
  PlacesLookupResult,
  PlacesPort,
  TemplateStorePort,
} from "./ports";
import type { Logger } from "@/lib/infrastructure/logger";
import {
  PreviewStatus,
  type KeywordVolume,
  type PreviewRequest,
  type PreviewResponse,
  type Trade,
} from "@/lib/domain/schemas";
import { computeLoss } from "@/lib/domain/loss-calc";
import {
  populationScaledVolumes,
  totalVolumeOf,
} from "@/lib/domain/keyword-volume-fallback";
import { KEYWORD_OVERLAP_DISCOUNT } from "@/lib/domain/trade-config";
import { renderTemplate, type TemplateData } from "@/lib/domain/template-render";
import { slugify, normalisePostcode } from "@/lib/infrastructure/cache/keys";
import type { DomainError, IntegrationError } from "@/lib/domain/errors";

export interface PreviewDeps {
  readonly geo: GeoPort;
  readonly places: PlacesPort;
  readonly volume: KeywordVolumePort;
  readonly cache: CachePort;
  readonly templateStore: TemplateStorePort;
  readonly loadTemplate: (trade: Trade) => string;
  readonly appUrl: string;
  readonly logger: Logger;
  readonly clock: Clock;
}

const PLACES_API_COST_USD = 0.066;
const DATAFORSEO_API_COST_USD = 0.075;
const FALLBACK_PHOTO_PLACEHOLDER = (n: number): string =>
  `https://placehold.co/800x600/1E3A5F/F5F0E6?text=Photo+${n}`;

const integrationToDomain = (
  err: IntegrationError,
  source: "places" | "postcodes_io" | "dataforseo",
): DomainError => {
  switch (err.kind) {
    case "not_found":
      return source === "places"
        ? { kind: "business_not_found" }
        : {
            kind: "validation",
            issues: [{ path: "postcode", message: "Invalid or unknown UK postcode" }],
          };
    case "quota_exhausted":
      return {
        kind: "api_quota_exhausted",
        source: source === "places" ? "places" : "dataforseo",
      };
    case "timeout":
      return { kind: "api_timeout", source };
    case "permanent":
      return source === "postcodes_io"
        ? {
            kind: "validation",
            issues: [{ path: "postcode", message: "Invalid or unknown UK postcode" }],
          }
        : { kind: "internal", cause: err };
    case "transient":
    case "http":
      return { kind: "internal", cause: err };
  }
};

const buildSlug = (businessName: string, postcode: string): string =>
  `${slugify(businessName)}-${normalisePostcode(postcode).replace(/\s+/g, "").toLowerCase()}`;

const toE164 = (raw: string): string => {
  const parsed = parsePhoneNumberFromString(raw, "GB");
  return parsed === undefined ? raw : parsed.format("E.164");
};

const formatDate = (d: Date): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);

const buildTemplateData = (input: {
  business_name: string;
  town: string;
  phone: string;
  formatted_phone: string | null;
  rating: number | null;
  review_count: number | null;
  photos: readonly string[];
  asOfDate: Date;
}): TemplateData => {
  const photo1 = input.photos[0] ?? FALLBACK_PHOTO_PLACEHOLDER(1);
  const photo2 = input.photos[1] ?? FALLBACK_PHOTO_PLACEHOLDER(2);
  const photo3 = input.photos[2] ?? FALLBACK_PHOTO_PLACEHOLDER(3);
  return {
    business_name: input.business_name,
    town: input.town,
    phone: input.formatted_phone ?? input.phone,
    phone_href: toE164(input.formatted_phone ?? input.phone),
    rating: input.rating !== null ? input.rating.toFixed(1) : undefined,
    review_count: input.review_count ?? undefined,
    photo_1_url: photo1,
    photo_2_url: photo2,
    photo_3_url: photo3,
    as_of_date: formatDate(input.asOfDate),
  };
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

  const cachedVolumes = await deps.cache.getVolume(input.trade, geo.town);
  const placesPromise = deps.places.lookupBusinessAndCompetitors({
    business_name: input.business_name,
    phone: input.phone,
    trade: input.trade,
    geo,
  });

  let volumes: readonly KeywordVolume[];
  let volumeSource: "dataforseo" | "fallback";
  let dataForSeoCostUsd = 0;

  if (cachedVolumes.isJust) {
    volumes = cachedVolumes.value;
    volumeSource = "dataforseo";
  } else {
    const volumeResult = await deps.volume.fetchVolumes({ trade: input.trade, town: geo.town });
    if (volumeResult.isOk) {
      volumes = volumeResult.value;
      volumeSource = "dataforseo";
      dataForSeoCostUsd = DATAFORSEO_API_COST_USD;
      await deps.cache.setVolume(input.trade, geo.town, volumes);
    } else {
      deps.logger.warn("dataforseo unavailable, using population fallback", {
        request_id: requestId,
        trade: input.trade,
        town: geo.town,
        error: volumeResult.error,
      });
      volumes = populationScaledVolumes(input.trade, geo.town);
      volumeSource = "fallback";
    }
  }

  const placesResult = await placesPromise;
  let placesData: PlacesLookupResult | null = null;
  let placesCostUsd = 0;
  if (placesResult.isOk) {
    placesData = placesResult.value;
    placesCostUsd = PLACES_API_COST_USD;
  } else {
    deps.logger.warn("places lookup failed", {
      request_id: requestId,
      error: placesResult.error,
    });
    if (placesResult.error.kind !== "not_found") {
      return Result.err(integrationToDomain(placesResult.error, "places"));
    }
  }

  const totalSearches = Math.round(totalVolumeOf(volumes) * KEYWORD_OVERLAP_DISCOUNT);
  const localPackRank =
    placesData !== null && typeof placesData.current_rank === "number"
      ? placesData.current_rank <= 3
        ? placesData.current_rank
        : null
      : null;
  const organicRank =
    placesData !== null && typeof placesData.current_rank === "number" && placesData.current_rank > 3
      ? placesData.current_rank
      : null;

  const loss = computeLoss({
    total_searches: totalSearches,
    current_local_pack_rank: localPackRank,
    current_organic_rank: organicRank,
    trade: input.trade,
    avg_job_value: input.avg_job_value,
  });

  const slug = buildSlug(input.business_name, input.postcode);
  const templateData = buildTemplateData({
    business_name: placesData?.business.name ?? input.business_name,
    town: geo.town,
    phone: input.phone,
    formatted_phone: placesData?.business.formatted_phone ?? null,
    rating: placesData?.business.rating ?? null,
    review_count: placesData?.business.review_count ?? null,
    photos: placesData?.business.photos ?? [],
    asOfDate: startedAt,
  });
  const templateString = deps.loadTemplate(input.trade);
  const renderedHtml = renderTemplate(templateString, templateData);
  await deps.templateStore.put(slug, renderedHtml);
  const previewUrl = `${deps.appUrl}/sites/${slug}`;

  const elapsed = Date.now() - startedAt.getTime();
  const asOfDate = startedAt.toISOString().slice(0, 10);

  const placesRankAboveTwenty =
    placesData !== null && placesData.current_rank === ">20";
  const status =
    placesData === null
      ? PreviewStatus.NO_GBP
      : placesRankAboveTwenty
        ? PreviewStatus.RANK_TOO_LOW
        : PreviewStatus.OK;

  const apiCostUsd = placesCostUsd + dataForSeoCostUsd;

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
      total_monthly_volume: totalSearches,
      keyword_breakdown: volumes.map((v) => ({ keyword: v.keyword, volume: v.volume })),
      volume_source: volumeSource,
    },
    loss: {
      monthly_pounds: loss.monthly_pounds,
      annual_pounds: loss.annual_pounds,
      recoverable_clicks_per_month: loss.recoverable_clicks_per_month,
      formula_inputs: loss.formula_inputs,
      capped: loss.capped,
    },
    meta: {
      cached: false,
      api_cost_usd: apiCostUsd,
      elapsed_ms: elapsed,
      request_id: requestId,
      as_of_date: asOfDate,
    },
    preview_url: previewUrl,
  };

  deps.logger.info("preview generated", {
    request_id: requestId,
    trade: input.trade,
    town: geo.town,
    elapsed_ms: elapsed,
    status,
    current_rank: placesData?.current_rank,
    monthly_loss_gbp: loss.monthly_pounds,
    volume_source: volumeSource,
    api_cost_usd: apiCostUsd,
    preview_slug: slug,
  });

  return Result.ok(response);
};
