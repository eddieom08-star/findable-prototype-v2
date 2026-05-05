import { CTR_CURVE, ctrAtRank } from "./ctr-curve";
import { TRADE_CONFIG } from "./trade-config";
import type { Trade } from "./schemas";

export interface LossInput {
  readonly total_searches: number;
  readonly current_local_pack_rank: number | null;
  readonly current_organic_rank: number | null;
  readonly trade: Trade;
  readonly avg_job_value: number;
  readonly conversion_rate?: number;
}

export interface LossResult {
  readonly monthly_pounds: number;
  readonly annual_pounds: number;
  readonly recoverable_clicks_per_month: number;
  readonly capped: boolean;
  readonly formula_inputs: {
    readonly total_searches: number;
    readonly current_local_pack_rank: number | null;
    readonly current_organic_rank: number | null;
    readonly target_ctr: number;
    readonly current_ctr: number;
    readonly gap_ctr: number;
    readonly conversion_rate: number;
    readonly avg_job_value: number;
  };
}

export const LOSS_HARD_CAP_GBP = 8_000;

const safe = (n: number): number => (Number.isFinite(n) ? n : 0);

// CORRECTED FORMULA (2026-05-04): the realistic target is local-pack-3 (CTR 10%),
// not the combined top-3 capture share. See loss-calc-methodology.md §1 callout
// and scripts/test-loss-calc.js for the reference implementation.
export const computeLoss = (input: LossInput): LossResult => {
  const config = TRADE_CONFIG[input.trade];
  const conversionRate = input.conversion_rate ?? config.lead_to_job_rate;
  const totalSearches = Math.max(0, safe(input.total_searches));
  const avgJobValue = Math.max(0, safe(input.avg_job_value));

  const targetCtr = CTR_CURVE.local_pack_3;
  const currentCtr = ctrAtRank(input.current_local_pack_rank, input.current_organic_rank);
  const gapCtr = Math.max(0, targetCtr - currentCtr);

  const recoverableClicks = totalSearches * gapCtr;
  const monthlyJobs = recoverableClicks * conversionRate;
  let monthlyPounds = monthlyJobs * avgJobValue;

  const capped = monthlyPounds > LOSS_HARD_CAP_GBP;
  if (capped) monthlyPounds = LOSS_HARD_CAP_GBP;

  return {
    monthly_pounds: Math.round(monthlyPounds),
    annual_pounds: Math.round(monthlyPounds * 12),
    recoverable_clicks_per_month: Math.round(recoverableClicks),
    capped,
    formula_inputs: {
      total_searches: Math.round(totalSearches),
      current_local_pack_rank: input.current_local_pack_rank,
      current_organic_rank: input.current_organic_rank,
      target_ctr: targetCtr,
      current_ctr: currentCtr,
      gap_ctr: gapCtr,
      conversion_rate: conversionRate,
      avg_job_value: avgJobValue,
    },
  };
};
