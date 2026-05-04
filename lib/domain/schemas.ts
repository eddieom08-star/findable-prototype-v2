import { z } from "zod";

export const POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}$/i;
export const UK_PHONE_REGEX = /^(?:\+44|0)\s*[\d\s-]{9,13}$/;

export const TRADES = ["plumber", "electrician"] as const;
export type Trade = (typeof TRADES)[number];

export const PreviewStatus = {
  OK: "ok",
  NO_GBP: "no_gbp",
  RANK_TOO_LOW: "rank_too_low",
  TEST_DATA: "test_data",
} as const;
export type PreviewStatus = (typeof PreviewStatus)[keyof typeof PreviewStatus];

export const KeywordVolumeSchema = z.object({
  keyword: z.string(),
  volume: z.number(),
});
export type KeywordVolume = z.infer<typeof KeywordVolumeSchema>;

export const GeoResultSchema = z.object({
  town: z.string(),
  county: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type GeoResult = z.infer<typeof GeoResultSchema>;

export const PreviewRequestSchema = z.object({
  business_name: z.string().min(2).max(100),
  postcode: z.string().regex(POSTCODE_REGEX, "Invalid UK postcode"),
  phone: z.string().regex(UK_PHONE_REGEX, "Invalid UK phone number"),
  avg_job_value: z.number().min(10).max(10000),
  trade: z.enum(TRADES),
  jobs_per_month: z.enum(["under_20", "20_50", "50_100", "100_plus"]).optional(),
  website: z.union([z.string().url(), z.literal("")]).optional(),
  ref: z.string().optional(),
});
export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;

const CompetitorSchema = z.object({
  name: z.string(),
  rating: z.number().nullable(),
  review_count: z.number().nullable(),
});

const FormulaInputsSchema = z.object({
  total_searches: z.number(),
  current_local_pack_rank: z.number().nullable(),
  current_organic_rank: z.number().nullable(),
  target_ctr: z.number(),
  current_ctr: z.number(),
  gap_ctr: z.number(),
  conversion_rate: z.number(),
  avg_job_value: z.number(),
});

export const PreviewResponseSchema = z.object({
  status: z.enum([
    PreviewStatus.OK,
    PreviewStatus.NO_GBP,
    PreviewStatus.RANK_TOO_LOW,
    PreviewStatus.TEST_DATA,
  ]),
  business: z.object({
    name: z.string(),
    place_id: z.string().nullable(),
    rating: z.number().nullable(),
    review_count: z.number().nullable(),
    photos: z.array(z.string().url()),
    formatted_address: z.string().nullable(),
    formatted_phone: z.string().nullable(),
    website: z.string().nullable(),
    business_types: z.array(z.string()),
  }),
  geo: GeoResultSchema,
  competitors: z.object({
    top_3: z.array(CompetitorSchema),
    current_rank: z.union([z.number(), z.literal(">20")]),
  }),
  search: z.object({
    total_monthly_volume: z.number(),
    keyword_breakdown: z.array(KeywordVolumeSchema),
    volume_source: z.enum(["dataforseo", "fallback"]),
  }),
  loss: z.object({
    monthly_pounds: z.number(),
    annual_pounds: z.number(),
    recoverable_clicks_per_month: z.number(),
    formula_inputs: FormulaInputsSchema,
    capped: z.boolean(),
  }),
  meta: z.object({
    cached: z.boolean(),
    api_cost_usd: z.number(),
    elapsed_ms: z.number(),
    request_id: z.string(),
    as_of_date: z.string(),
  }),
  preview_url: z.string().url().nullable(),
});
export type PreviewResponse = z.infer<typeof PreviewResponseSchema>;
