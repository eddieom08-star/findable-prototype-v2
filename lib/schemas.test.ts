import { describe, it, expect } from "vitest";
import { PreviewRequestSchema } from "./schemas";

const baseValidRequest = {
  business_name: "Wigan Plumbing Co",
  postcode: "WN1 2AB",
  phone: "07700 900123",
  avg_job_value: 180,
  trade: "plumber" as const,
};

describe("PreviewRequestSchema", () => {
  it("accepts a minimal valid payload", () => {
    const result = PreviewRequestSchema.safeParse(baseValidRequest);
    expect(result.success).toBe(true);
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
    const result = PreviewRequestSchema.safeParse({ ...baseValidRequest, website: "" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid postcode", () => {
    const result = PreviewRequestSchema.safeParse({ ...baseValidRequest, postcode: "NOT-A-CODE" });
    expect(result.success).toBe(false);
  });

  it("rejects an avg_job_value above the £10k cap", () => {
    const result = PreviewRequestSchema.safeParse({ ...baseValidRequest, avg_job_value: 12000 });
    expect(result.success).toBe(false);
  });

  it("rejects a trade outside the v1 supported set", () => {
    const result = PreviewRequestSchema.safeParse({ ...baseValidRequest, trade: "hairdresser" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { phone, ...withoutPhone } = baseValidRequest;
    void phone;
    const result = PreviewRequestSchema.safeParse(withoutPhone);
    expect(result.success).toBe(false);
  });
});
