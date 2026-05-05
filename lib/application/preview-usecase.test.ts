import { describe, expect, it } from "vitest";
import { Result } from "true-myth";
import { runPreview } from "./preview-usecase";
import type { GeoPort, PlacesPort, PlacesLookupResult } from "./ports";
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

const wiganPlacesOk: PlacesLookupResult = {
  business: {
    place_id: "place-A",
    name: "Wigan Plumbing Co",
    rating: 4.7,
    review_count: 38,
    photos: ["https://maps.googleapis.com/photo?ref=ref-1"],
    formatted_address: "1 Mock Street, Wigan",
    formatted_phone: "01942 123456",
    website: "https://example.com",
    business_types: ["plumber"],
    lat: 53.5417,
    lng: -2.6321,
  },
  competitors: [
    { name: "Top Plumber", rating: 4.9, review_count: 120 },
    { name: "Second Plumber", rating: 4.8, review_count: 90 },
  ],
  current_rank: 5,
};

const stubGeo = (impl: GeoPort["lookup"]): GeoPort => ({ lookup: impl });
const stubPlaces = (impl: PlacesPort["lookupBusinessAndCompetitors"]): PlacesPort => ({
  lookupBusinessAndCompetitors: impl,
});

const okGeo = stubGeo(async () => Result.ok(wiganGeo));
const okPlaces = stubPlaces(async () => Result.ok(wiganPlacesOk));

describe("runPreview", () => {
  it("returns a schema-valid PreviewResponse on the happy path with Places data", async () => {
    const result = await runPreview(
      validRequest,
      { geo: okGeo, places: okPlaces, logger: silentLogger, clock: fixedClock },
      "rid-1",
    );
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.status).toBe("test_data");
      expect(result.value.business.place_id).toBe("place-A");
      expect(result.value.business.rating).toBe(4.7);
      expect(result.value.business.review_count).toBe(38);
      expect(result.value.competitors.top_3).toHaveLength(2);
      expect(result.value.competitors.current_rank).toBe(5);
      expect(result.value.loss.formula_inputs.current_local_pack_rank).toBe(5);
      expect(result.value.meta.api_cost_usd).toBeGreaterThan(0);
      expect(result.value.meta.request_id).toBe("rid-1");
      expect(result.value.meta.as_of_date).toBe("2026-05-04");
    }
  });

  it("falls back to no_gbp status when Places returns not_found", async () => {
    const places = stubPlaces(async () =>
      Result.err({ kind: "not_found" } as IntegrationError),
    );
    const result = await runPreview(
      validRequest,
      { geo: okGeo, places, logger: silentLogger, clock: fixedClock },
      "rid-2",
    );
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.status).toBe("no_gbp");
      expect(result.value.business.place_id).toBeNull();
      expect(result.value.competitors.current_rank).toBe(">20");
      expect(result.value.meta.api_cost_usd).toBe(0);
    }
  });

  it("maps a Places quota_exhausted error to api_quota_exhausted DomainError", async () => {
    const places = stubPlaces(async () =>
      Result.err({ kind: "quota_exhausted", source: "find_place" } as IntegrationError),
    );
    const result = await runPreview(
      validRequest,
      { geo: okGeo, places, logger: silentLogger, clock: fixedClock },
      "rid-3",
    );
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.kind).toBe("api_quota_exhausted");
      if (result.error.kind === "api_quota_exhausted") expect(result.error.source).toBe("places");
    }
  });

  it("maps a Places timeout to api_timeout(places)", async () => {
    const places = stubPlaces(async () =>
      Result.err({ kind: "timeout", elapsedMs: 5001 } as IntegrationError),
    );
    const result = await runPreview(
      validRequest,
      { geo: okGeo, places, logger: silentLogger, clock: fixedClock },
      "rid-4",
    );
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.kind).toBe("api_timeout");
      if (result.error.kind === "api_timeout") expect(result.error.source).toBe("places");
    }
  });

  it("maps a permanent geo error to a validation DomainError", async () => {
    const geo = stubGeo(async () =>
      Result.err({ kind: "permanent", cause: "unknown postcode" } as IntegrationError),
    );
    const result = await runPreview(
      validRequest,
      { geo, places: okPlaces, logger: silentLogger, clock: fixedClock },
      "rid-5",
    );
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.kind).toBe("validation");
      if (result.error.kind === "validation") {
        expect(result.error.issues[0]?.path).toBe("postcode");
      }
    }
  });

  it("maps a geo timeout to api_timeout(postcodes_io)", async () => {
    const geo = stubGeo(async () =>
      Result.err({ kind: "timeout", elapsedMs: 3001 } as IntegrationError),
    );
    const result = await runPreview(
      validRequest,
      { geo, places: okPlaces, logger: silentLogger, clock: fixedClock },
      "rid-6",
    );
    expect(result.isErr).toBe(true);
    if (result.isErr && result.error.kind === "api_timeout") {
      expect(result.error.source).toBe("postcodes_io");
    }
  });

  it("maps a geo http error to internal", async () => {
    const geo = stubGeo(async () =>
      Result.err({ kind: "http", status: 503, cause: "upstream busy" } as IntegrationError),
    );
    const result = await runPreview(
      validRequest,
      { geo, places: okPlaces, logger: silentLogger, clock: fixedClock },
      "rid-7",
    );
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("internal");
  });
});
