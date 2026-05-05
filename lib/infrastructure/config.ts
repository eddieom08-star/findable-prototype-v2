import { z } from "zod";

const ConfigSchema = z.object({
  // KV is optional in dev (memory cache fallback); required at deploy via Vercel env injection.
  KV_REST_API_URL: z.string().url().optional(),
  KV_REST_API_TOKEN: z.string().min(1).optional(),
  KV_REST_API_READ_ONLY_TOKEN: z.string().min(1).optional(),

  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
  GOOGLE_PLACES_BILLING_ALERT_THRESHOLD_USD: z.coerce.number().default(20),

  DATAFORSEO_LOGIN: z.string().min(1).optional(),
  DATAFORSEO_PASSWORD: z.string().min(1).optional(),

  COMPANIES_HOUSE_API_KEY: z.string().min(1).optional(),
  FIRECRAWL_API_KEY: z.string().min(1).optional(),

  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_BRAND: z.string().default("findable"),

  // Vercel auto-injects these on every deploy. We use them to derive the canonical
  // appUrl so preview links resolve to the right host without manual env-var setup.
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOSS_HARD_CAP_GBP: z.coerce.number().default(8000),
  PHONE_REQUIRED: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() === "true"),
  TEST_DATA_PATTERNS: z
    .string()
    .default("test plumbing,demo electric")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
});

type RawConfig = z.infer<typeof ConfigSchema>;

export interface AppConfig extends Readonly<RawConfig> {
  readonly APP_URL: string;
}

const computeAppUrl = (raw: RawConfig): string => {
  if (raw.VERCEL_ENV === "production" && raw.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${raw.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (raw.VERCEL_URL) return `https://${raw.VERCEL_URL}`;
  if (raw.NEXT_PUBLIC_APP_URL) return raw.NEXT_PUBLIC_APP_URL;
  return "http://localhost:3000";
};

let _cached: AppConfig | null = null;

export const loadConfig = (): AppConfig => {
  if (_cached !== null) return _cached;
  const parsed = ConfigSchema.parse(process.env);
  const config: AppConfig = Object.freeze({
    ...parsed,
    APP_URL: computeAppUrl(parsed),
  });
  _cached = config;
  return config;
};

export const __resetConfigForTests = (): void => {
  _cached = null;
};
