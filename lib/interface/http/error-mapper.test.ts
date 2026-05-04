import { describe, expect, it } from "vitest";
import { mapDomainErrorToHttp } from "./error-mapper";
import type { DomainError } from "@/lib/domain/errors";

const RID = "req-123";

const cases: Array<{ name: string; input: DomainError; status: number; error: string }> = [
  {
    name: "validation -> 400 'validation'",
    input: { kind: "validation", issues: [{ path: "postcode", message: "bad" }] },
    status: 400,
    error: "validation",
  },
  {
    name: "business_not_found -> 200 'no_gbp'",
    input: { kind: "business_not_found" },
    status: 200,
    error: "no_gbp",
  },
  {
    name: "rank_too_low -> 200 'rank_too_low'",
    input: { kind: "rank_too_low", rank: 27 },
    status: 200,
    error: "rank_too_low",
  },
  {
    name: "api_quota_exhausted (places) -> 503",
    input: { kind: "api_quota_exhausted", source: "places" },
    status: 503,
    error: "quota_exhausted",
  },
  {
    name: "api_timeout (dataforseo) -> 504",
    input: { kind: "api_timeout", source: "dataforseo" },
    status: 504,
    error: "timeout",
  },
  {
    name: "internal -> 500",
    input: { kind: "internal", cause: new Error("boom") },
    status: 500,
    error: "internal",
  },
];

describe("mapDomainErrorToHttp", () => {
  it.each(cases)("$name", ({ input, status, error }) => {
    const out = mapDomainErrorToHttp(input, RID);
    expect(out.status).toBe(status);
    expect(out.body.error).toBe(error);
    expect(out.body.request_id).toBe(RID);
  });

  it("never throws on any DomainError variant (exhaustiveness)", () => {
    for (const c of cases) {
      expect(() => mapDomainErrorToHttp(c.input, RID)).not.toThrow();
    }
  });
});
