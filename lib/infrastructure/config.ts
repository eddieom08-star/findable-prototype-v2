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

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_BRAND: z.string().default("findable"),

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

export type AppConfig = Readonly<z.infer<typeof ConfigSchema>>;

let _cached: AppConfig | null = null;

export const loadConfig = (): AppConfig => {
  if (_cached !== null) return _cached;
  const parsed = ConfigSchema.parse(process.env);
  _cached = Object.freeze(parsed);
  return _cached;
};

export const __resetConfigForTests = (): void => {
  _cached = null;
};
