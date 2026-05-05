import { describe, expect, it } from "vitest";
import { LOSS_HARD_CAP_GBP, computeLoss } from "./loss-calc";

describe("computeLoss (corrected formula 2026-05-04)", () => {
  it("returns zero loss when prospect already ranks at local pack 1", () => {
    const result = computeLoss({
      total_searches: 1000,
      current_local_pack_rank: 1,
      current_organic_rank: null,
      trade: "plumber",
      avg_job_value: 180,
    });
    expect(result.monthly_pounds).toBe(0);
    expect(result.annual_pounds).toBe(0);
    expect(result.formula_inputs.current_ctr).toBe(0.32);
    expect(result.formula_inputs.gap_ctr).toBe(0);
  });

  it("returns zero loss when prospect ranks at the target (local pack 3)", () => {
    const result = computeLoss({
      total_searches: 1000,
      current_local_pack_rank: 3,
      current_organic_rank: null,
      trade: "plumber",
      avg_job_value: 180,
    });
    expect(result.monthly_pounds).toBe(0);
    expect(result.formula_inputs.current_ctr).toBe(0.10);
    expect(result.formula_inputs.gap_ctr).toBe(0);
  });

  it("computes a realistic loss for a typical Wigan plumber at organic rank 11", () => {
    const result = computeLoss({
      total_searches: 1000,
      current_local_pack_rank: null,
      current_organic_rank: 11,
      trade: "plumber",
      avg_job_value: 180,
    });
    // gap = 0.10 - 0.005 = 0.095; clicks = 95; jobs = 95 * 0.35 = 33.25; £ = 33.25 * 180
    expect(result.monthly_pounds).toBe(5985);
    expect(result.recoverable_clicks_per_month).toBe(95);
    expect(result.capped).toBe(false);
  });

  it("treats rank >30 (effectively invisible) with the floor CTR", () => {
    const result = computeLoss({
      total_searches: 1000,
      current_local_pack_rank: null,
      current_organic_rank: 50,
      trade: "plumber",
      avg_job_value: 180,
    });
    // gap = 0.10 - 0.001 = 0.099; clicks = 99; jobs = 99 * 0.35 = 34.65; £ = 34.65 * 180
    expect(result.monthly_pounds).toBe(6237);
    expect(result.formula_inputs.current_ctr).toBe(0.001);
  });

  it("treats null ranks (no GBP, no organic) as worst case (floor CTR)", () => {
    const result = computeLoss({
      total_searches: 800,
      current_local_pack_rank: null,
      current_organic_rank: null,
      trade: "plumber",
      avg_job_value: 180,
    });
    expect(result.formula_inputs.current_ctr).toBe(0.001);
    expect(result.monthly_pounds).toBeGreaterThan(0);
  });

  it("applies the £8k hard cap on extreme inputs", () => {
    const result = computeLoss({
      total_searches: 5000,
      current_local_pack_rank: null,
      current_organic_rank: 50,
      trade: "plumber",
      avg_job_value: 400,
    });
    expect(result.monthly_pounds).toBe(LOSS_HARD_CAP_GBP);
    expect(result.capped).toBe(true);
  });

  it("returns zero loss when total_searches is zero", () => {
    const result = computeLoss({
      total_searches: 0,
      current_local_pack_rank: null,
      current_organic_rank: 11,
      trade: "plumber",
      avg_job_value: 180,
    });
    expect(result.monthly_pounds).toBe(0);
    expect(result.annual_pounds).toBe(0);
  });

  it("guards against NaN inputs (returns zero, no NaN propagation)", () => {
    const result = computeLoss({
      total_searches: Number.NaN,
      current_local_pack_rank: null,
      current_organic_rank: 11,
      trade: "plumber",
      avg_job_value: Number.NaN,
    });
    expect(result.monthly_pounds).toBe(0);
    expect(Number.isFinite(result.monthly_pounds)).toBe(true);
  });

  it("uses the trade default conversion_rate when none is supplied", () => {
    const result = computeLoss({
      total_searches: 1000,
      current_local_pack_rank: null,
      current_organic_rank: 11,
      trade: "electrician",
      avg_job_value: 220,
    });
    // electrician default conversion_rate = 0.35; gap = 0.095
    expect(result.formula_inputs.conversion_rate).toBe(0.35);
    expect(result.monthly_pounds).toBe(7315);
  });

  it("respects an explicit conversion_rate override (user-edited slider)", () => {
    const base = computeLoss({
      total_searches: 1000,
      current_local_pack_rank: null,
      current_organic_rank: 11,
      trade: "plumber",
      avg_job_value: 180,
    });
    const halved = computeLoss({
      total_searches: 1000,
      current_local_pack_rank: null,
      current_organic_rank: 11,
      trade: "plumber",
      avg_job_value: 180,
      conversion_rate: 0.175,
    });
    expect(halved.monthly_pounds).toBe(Math.round(base.monthly_pounds / 2));
    expect(halved.formula_inputs.conversion_rate).toBe(0.175);
  });

  it("computes annual = monthly × 12", () => {
    const result = computeLoss({
      total_searches: 500,
      current_local_pack_rank: null,
      current_organic_rank: 7,
      trade: "plumber",
      avg_job_value: 200,
    });
    expect(result.annual_pounds).toBe(result.monthly_pounds * 12);
  });
});
