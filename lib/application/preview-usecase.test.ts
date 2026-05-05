import { describe, expect, it } from "vitest";
import { Result, Maybe } from "true-myth";
import { runPreview } from "./preview-usecase";
import type {
  CachePort,
  GeoPort,
  KeywordVolumePort,
  PlacesLookupResult,
  PlacesPort,
} from "./ports";
import type { GeoResult, KeywordVolume, PreviewRequest } from "@/lib/domain/schemas";
import type { IntegrationError } from "@/lib/domain/errors";
import { createLogger } from "@/lib/infrastructure/logger";
import { createMemoryCache } from "@/lib/infrastructure/cache/memory-cache";

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
    photos: ["https://places.googleapis.com/v1/places/place-A/photos/x/media?key=t"],
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
  current_rank: 8,
};

const wiganVolumes: readonly KeywordVolume[] = [
  { keyword: "plumber wigan", volume: 110 },
  { keyword: "emergency plumber wigan", volume: 50 },
  { keyword: "boiler repair wigan", volume: 20 },
  { keyword: "drain unblocking wigan", volume: 30 },
];

const stubGeo = (impl: GeoPort["lookup"]): GeoPort => ({ lookup: impl });
const stubPlaces = (impl: PlacesPort["lookupBusinessAndCompetitors"]): PlacesPort => ({
  lookupBusinessAndCompetitors: impl,
});
const stubVolume = (impl: KeywordVolumePort["fetchVolumes"]): KeywordVolumePort => ({
  fetchVolumes: impl,
});

const okGeo = stubGeo(async () => Result.ok(wiganGeo));
const okPlaces = stubPlaces(async () => Result.ok(wiganPlacesOk));
const okVolume = stubVolume(async () => Result.ok(wiganVolumes));

describe("runPreview (real loss-calc wired)", () => {
  it("returns status='ok' with real loss number when Places + DataForSEO both succeed", async () => {
    const result = await runPreview(
      validRequest,
      {
        geo: okGeo,
        places: okPlaces,
        volume: okVolume,
        cache: createMemoryCache(),
        logger: silentLogger,
        clock: fixedClock,
      },
      "rid-1",
    );
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.status).toBe("ok");
      // Wigan plumber, organic rank 8, volume 210*0.8=168, gap=0.10-0.015=0.085
      // clicks=14.28, jobs=14.28*0.35=5, £=5*180 = ~900
      expect(result.value.loss.monthly_pounds).toBeGreaterThan(0);
      expect(result.value.loss.monthly_pounds).toBeLessThan(8000);
      expect(result.value.loss.formula_inputs.target_ctr).toBe(0.10);
      expect(result.value.loss.formula_inputs.current_ctr).toBe(0.015);
      expect(result.value.search.volume_source).toBe("dataforseo");
      expect(result.value.search.keyword_breakdown).toHaveLength(4);
      expect(result.value.competitors.current_rank).toBe(8);
      expect(result.value.meta.api_cost_usd).toBeGreaterThan(0.06);
    }
  });

  it("falls back to population-scaled volumes with volume_source='fallback' when DataForSEO errors", async () => {
    const failingVolume = stubVolume(async () =>
      Result.err({ kind: "quota_exhausted", source: "dataforseo" } as IntegrationError),
    );
    const result = await runPreview(
      validRequest,
      {
        geo: okGeo,
        places: okPlaces,
        volume: failingVolume,
        cache: createMemoryCache(),
        logger: silentLogger,
        clock: fixedClock,
      },
      "rid-2",
    );
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.search.volume_source).toBe("fallback");
      expect(result.value.search.total_monthly_volume).toBeGreaterThan(0);
      expect(result.value.loss.monthly_pounds).toBeGreaterThan(0);
    }
  });

  it("uses cached DataForSEO volumes when present (skips fetch + cost)", async () => {
    const cache = createMemoryCache();
    await cache.setVolume("plumber", "Wigan", wiganVolumes);
    let called = 0;
    const trackedVolume = stubVolume(async () => {
      called += 1;
      return Result.ok(wiganVolumes);
    });
    const result = await runPreview(
      validRequest,
      {
        geo: okGeo,
        places: okPlaces,
        volume: trackedVolume,
        cache,
        logger: silentLogger,
        clock: fixedClock,
      },
      "rid-3",
    );
    expect(result.isOk).toBe(true);
    expect(called).toBe(0);
    if (result.isOk) {
      expect(result.value.search.volume_source).toBe("dataforseo");
      // No DataForSEO cost when cache hit
      expect(result.value.meta.api_cost_usd).toBeLessThan(0.07);
    }
  });

  it("returns status='no_gbp' when Places not_found but still computes loss using fallback rank", async () => {
    const places = stubPlaces(async () => Result.err({ kind: "not_found" } as IntegrationError));
    const result = await runPreview(
      validRequest,
      {
        geo: okGeo,
        places,
        volume: okVolume,
        cache: createMemoryCache(),
        logger: silentLogger,
        clock: fixedClock,
      },
      "rid-4",
    );
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.status).toBe("no_gbp");
      expect(result.value.business.place_id).toBeNull();
      expect(result.value.competitors.current_rank).toBe(">20");
      expect(result.value.loss.monthly_pounds).toBeGreaterThan(0);
    }
  });

  it("returns status='rank_too_low' when Places returns rank '>20'", async () => {
    const placesRankTooLow: PlacesLookupResult = { ...wiganPlacesOk, current_rank: ">20" };
    const places = stubPlaces(async () => Result.ok(placesRankTooLow));
    const result = await runPreview(
      validRequest,
      {
        geo: okGeo,
        places,
        volume: okVolume,
        cache: createMemoryCache(),
        logger: silentLogger,
        clock: fixedClock,
      },
      "rid-5",
    );
    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.value.status).toBe("rank_too_low");
  });

  it("maps Places quota_exhausted to api_quota_exhausted DomainError", async () => {
    const places = stubPlaces(async () =>
      Result.err({ kind: "quota_exhausted", source: "find_place" } as IntegrationError),
    );
    const result = await runPreview(
      validRequest,
      {
        geo: okGeo,
        places,
        volume: okVolume,
        cache: createMemoryCache(),
        logger: silentLogger,
        clock: fixedClock,
      },
      "rid-6",
    );
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.kind).toBe("api_quota_exhausted");
      if (result.error.kind === "api_quota_exhausted") expect(result.error.source).toBe("places");
    }
  });

  it("maps a permanent geo error to a validation DomainError", async () => {
    const geo = stubGeo(async () =>
      Result.err({ kind: "permanent", cause: "unknown postcode" } as IntegrationError),
    );
    const result = await runPreview(
      validRequest,
      {
        geo,
        places: okPlaces,
        volume: okVolume,
        cache: createMemoryCache(),
        logger: silentLogger,
        clock: fixedClock,
      },
      "rid-7",
    );
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("validation");
  });
});

void Maybe;
