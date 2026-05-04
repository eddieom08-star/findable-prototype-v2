import { describe, it, expect } from "vitest";
import { PreviewRequestSchema, KeywordVolumeSchema, GeoResultSchema } from "./schemas";

const baseValidRequest = {
  business_name: "Wigan Plumbing Co",
  postcode: "WN1 2AB",
  phone: "07700 900123",
  avg_job_value: 180,
  trade: "plumber" as const,
};

describe("PreviewRequestSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(PreviewRequestSchema.safeParse(baseValidRequest).success).toBe(true);
  });

  it("accepts the full payload with optional fields", () => {
    const result = PreviewRequestSchema.safeParse({
      ...baseValidRequest,
      jobs_per_month: "20_50",
      website: "https://example.com",
      ref: "outbound-2026-05",
    });
    expect(result.success).toBe(true);
  });

  it("accepts +44 phone format", () => {
    const result = PreviewRequestSchema.safeParse({
      ...baseValidRequest,
      phone: "+44 7700 900123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty website string (the toggle default)", () => {
    expect(
      PreviewRequestSchema.safeParse({ ...baseValidRequest, website: "" }).success,
    ).toBe(true);
  });

  it("rejects an invalid postcode", () => {
    expect(
      PreviewRequestSchema.safeParse({ ...baseValidRequest, postcode: "NOT-A-CODE" })
        .success,
    ).toBe(false);
  });

  it("rejects an avg_job_value above the £10k cap", () => {
    expect(
      PreviewRequestSchema.safeParse({ ...baseValidRequest, avg_job_value: 12000 })
        .success,
    ).toBe(false);
  });

  it("rejects a trade outside the v1 supported set", () => {
    expect(
      PreviewRequestSchema.safeParse({ ...baseValidRequest, trade: "hairdresser" })
        .success,
    ).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { phone, ...withoutPhone } = baseValidRequest;
    void phone;
    expect(PreviewRequestSchema.safeParse(withoutPhone).success).toBe(false);
  });
});

describe("KeywordVolumeSchema", () => {
  it("accepts a valid pair", () => {
    expect(
      KeywordVolumeSchema.safeParse({ keyword: "plumber wigan", volume: 1300 })
        .success,
    ).toBe(true);
  });
});

describe("GeoResultSchema", () => {
  it("accepts a valid postcodes.io-shaped payload", () => {
    expect(
      GeoResultSchema.safeParse({
        town: "Wigan",
        county: "Greater Manchester",
        lat: 53.5417,
        lng: -2.6321,
      }).success,
    ).toBe(true);
  });
});
