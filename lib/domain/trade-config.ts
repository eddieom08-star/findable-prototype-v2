import type { Trade } from "./schemas";

export interface TradeConfig {
  readonly keyword_bundle: readonly string[];
  readonly lead_to_job_rate: number;
  readonly default_avg_job_value: number;
  readonly default_volume_per_100k: number;
}

export const TRADE_CONFIG: Readonly<Record<Trade, TradeConfig>> = {
  plumber: {
    keyword_bundle: ["plumber", "emergency plumber", "boiler repair", "drain unblocking"],
    lead_to_job_rate: 0.35,
    default_avg_job_value: 180,
    default_volume_per_100k: 1200,
  },
  electrician: {
    keyword_bundle: ["electrician", "emergency electrician", "EICR", "fuse box replacement"],
    lead_to_job_rate: 0.35,
    default_avg_job_value: 220,
    default_volume_per_100k: 800,
  },
};

export const KEYWORD_OVERLAP_DISCOUNT = 0.8;
