import { describe, expect, it } from "vitest";
import { Result } from "true-myth";
import { runPreview } from "./preview-usecase";
import type { GeoPort } from "./ports";
import type { GeoResult, PreviewRequest } from "@/lib/domain/schemas";
import type { IntegrationError } from "@/lib/domain/errors";
import { createLogger } from "@/lib/infrastructure/logger";

const silentLogger = createLogger({ LOG_LEVEL: "error" });
const fixedClock = { now: () => new Date("2026-05-04T12:00:00Z") };

const validRequest: PreviewRequest = {
  business_name: "Wigan Plumbing Co",
  postcode: "WN1 2AB",
  phone: "07700 900123",
  avg_job_value: 180,
  trade: "plumber",
};

const wiganGeo: GeoResult = {
  town: "Wigan",
  county: "Greater Manchester",
  lat: 53.5417,
  lng: -2.6321,
};

const stubGeo = (impl: GeoPort["lookup"]): GeoPort => ({ lookup: impl });

describe("runPreview (stub)", () => {
  it("returns a schema-valid PreviewResponse on the happy path", async () => {
    const geo = stubGeo(async () => Result.ok(wiganGeo));
    const result = await runPreview(
      validRequest,
      { geo, logger: silentLogger, clock: fixedClock },
      "rid-1",
    );
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.geo.town).toBe("Wigan");
      expect(result.value.business.name).toBe("Wigan Plumbing Co");
      expect(result.value.meta.request_id).toBe("rid-1");
      expect(result.value.meta.as_of_date).toBe("2026-05-04");
      expect(result.value.loss.formula_inputs.avg_job_value).toBe(180);
      expect(result.value.preview_url).toBeNull();
    }
  });

  it("maps a permanent geo error to a validation DomainError", async () => {
    const geoErr: IntegrationError = { kind: "permanent", cause: "unknown postcode" };
    const geo = stubGeo(async () => Result.err(geoErr));
    const result = await runPreview(
      validRequest,
      { geo, logger: silentLogger, clock: fixedClock },
      "rid-2",
    );
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.kind).toBe("validation");
      if (result.error.kind === "validation") {
        expect(result.error.issues[0]?.path).toBe("postcode");
      }
    }
  });

  it("maps a geo timeout to api_timeout", async () => {
    const geoErr: IntegrationError = { kind: "timeout", elapsedMs: 3001 };
    const geo = stubGeo(async () => Result.err(geoErr));
    const result = await runPreview(
      validRequest,
      { geo, logger: silentLogger, clock: fixedClock },
      "rid-3",
    );
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.kind).toBe("api_timeout");
      if (result.error.kind === "api_timeout") {
        expect(result.error.source).toBe("postcodes_io");
      }
    }
  });

  it("maps a geo http error to internal (preserves the cause)", async () => {
    const geoErr: IntegrationError = { kind: "http", status: 503, cause: "upstream busy" };
    const geo = stubGeo(async () => Result.err(geoErr));
    const result = await runPreview(
      validRequest,
      { geo, logger: silentLogger, clock: fixedClock },
      "rid-4",
    );
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("internal");
  });
});
