import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlacesAdapter } from "./places";
import { createLogger } from "@/lib/infrastructure/logger";
import type { GeoResult } from "@/lib/domain/schemas";

const silentLogger = createLogger({ LOG_LEVEL: "error" });
const config = { GOOGLE_PLACES_API_KEY: "test-key" };

const wiganGeo: GeoResult = {
  town: "Wigan",
  county: "Greater Manchester",
  lat: 53.5417,
  lng: -2.6321,
};

interface PlaceFixture {
  id: string;
  name: string;
  rating?: number;
  userRatingCount?: number;
  phone?: string;
  photos?: number;
  types?: string[];
}

const placeV1 = (f: PlaceFixture) => ({
  id: f.id,
  displayName: { text: f.name },
  location: { latitude: 53.5417, longitude: -2.6321 },
  ...(f.rating !== undefined ? { rating: f.rating } : {}),
  ...(f.userRatingCount !== undefined ? { userRatingCount: f.userRatingCount } : {}),
  ...(f.phone !== undefined
    ? { nationalPhoneNumber: f.phone, internationalPhoneNumber: f.phone }
    : {}),
  ...(f.photos !== undefined
    ? {
        photos: Array.from({ length: f.photos }, (_, i) => ({
          name: `places/${f.id}/photos/photo-${i}`,
        })),
      }
    : {}),
  ...(f.types !== undefined ? { types: f.types } : {}),
  formattedAddress: "1 Mock Street, Wigan",
  websiteUri: "https://example.com",
});

const json = (body: object, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("places adapter (Places API New)", () => {
  const baseInput = {
    business_name: "Wigan Plumbing Co",
    phone: "07700 900123",
    trade: "plumber" as const,
    geo: wiganGeo,
  };

  it("returns business + competitors + rank on a happy single-candidate path", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          places: [placeV1({ id: "place-A", name: "Wigan Plumbing Co", photos: 2 })],
        }),
      )
      .mockResolvedValueOnce(
        json(
          placeV1({
            id: "place-A",
            name: "Wigan Plumbing Co",
            rating: 4.7,
            userRatingCount: 38,
            photos: 2,
            types: ["plumber", "point_of_interest"],
          }),
        ),
      )
      .mockResolvedValueOnce(
        json({
          places: [
            placeV1({ id: "place-X", name: "Top Plumber", rating: 4.9, userRatingCount: 120 }),
            placeV1({ id: "place-Y", name: "Second Plumber", rating: 4.8, userRatingCount: 90 }),
            placeV1({ id: "place-A", name: "Wigan Plumbing Co", rating: 4.7, userRatingCount: 38 }),
            placeV1({ id: "place-Z", name: "Filler", rating: 4.5, userRatingCount: 20 }),
          ],
        }),
      );
    const adapter = createPlacesAdapter(config, silentLogger);
    const result = await adapter.lookupBusinessAndCompetitors(baseInput);
    expect(result.isOk).toBe(true);
    if (!result.isOk) return;
    expect(result.value.business.place_id).toBe("place-A");
    expect(result.value.business.rating).toBe(4.7);
    expect(result.value.business.review_count).toBe(38);
    expect(result.value.business.photos).toHaveLength(2);
    expect(result.value.business.photos[0]).toContain(
      "https://places.googleapis.com/v1/places/place-A/photos/photo-0/media",
    );
    expect(result.value.competitors).toHaveLength(3);
    expect(result.value.competitors[0]?.name).toBe("Top Plumber");
    expect(result.value.current_rank).toBe(3);
  });

  it("sends X-Goog-Api-Key + X-Goog-FieldMask headers and POST for searchText", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ places: [placeV1({ id: "place-A", name: "Wigan Plumbing" })] }),
      )
      .mockResolvedValueOnce(json(placeV1({ id: "place-A", name: "Wigan Plumbing" })))
      .mockResolvedValueOnce(json({ places: [] }));

    const adapter = createPlacesAdapter(config, silentLogger);
    await adapter.lookupBusinessAndCompetitors(baseInput);

    const [searchUrl, searchInit] = fetchMock.mock.calls[0] ?? [];
    expect(searchUrl).toBe("https://places.googleapis.com/v1/places:searchText");
    expect((searchInit as RequestInit).method).toBe("POST");
    const headers = (searchInit as RequestInit).headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(headers["X-Goog-FieldMask"]).toContain("places.id");
    const body = JSON.parse((searchInit as RequestInit).body as string);
    expect(body.textQuery).toBe("Wigan Plumbing Co Wigan");
  });

  it("returns rank '>20' when our place is not in nearby results", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ places: [placeV1({ id: "place-A", name: "Wigan Plumbing" })] }),
      )
      .mockResolvedValueOnce(json(placeV1({ id: "place-A", name: "Wigan Plumbing" })))
      .mockResolvedValueOnce(
        json({
          places: Array.from({ length: 20 }, (_, i) =>
            placeV1({ id: `place-other-${i}`, name: `Other ${i}`, rating: 4.5 }),
          ),
        }),
      );
    const adapter = createPlacesAdapter(config, silentLogger);
    const result = await adapter.lookupBusinessAndCompetitors(baseInput);
    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.value.current_rank).toBe(">20");
  });

  it("disambiguates multi-candidate searchText by E.164 phone match", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          places: [
            placeV1({ id: "wrong-A", name: "Wrong", phone: "01942 999999" }),
            placeV1({ id: "right-B", name: "Right Match", phone: "07700 900123" }),
          ],
        }),
      )
      .mockResolvedValueOnce(json(placeV1({ id: "right-B", name: "Right Match" })))
      .mockResolvedValueOnce(
        json({ places: [placeV1({ id: "right-B", name: "Right Match", rating: 4.7 })] }),
      );
    const adapter = createPlacesAdapter(config, silentLogger);
    const result = await adapter.lookupBusinessAndCompetitors(baseInput);
    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.value.business.place_id).toBe("right-B");
    const detailsCall = fetchMock.mock.calls[1]?.[0] as string;
    expect(detailsCall).toContain("/v1/places/right-B");
  });

  it("maps empty places array to a not_found IntegrationError", async () => {
    fetchMock.mockResolvedValueOnce(json({ places: [] }));
    const adapter = createPlacesAdapter(config, silentLogger);
    const result = await adapter.lookupBusinessAndCompetitors(baseInput);
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("not_found");
  });

  it("maps HTTP 429 to quota_exhausted", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 429 } }, 429));
    const adapter = createPlacesAdapter(config, silentLogger);
    const result = await adapter.lookupBusinessAndCompetitors(baseInput);
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("quota_exhausted");
  });

  it("maps HTTP 403 (auth/permission) to a permanent error", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 403 } }, 403));
    const adapter = createPlacesAdapter(config, silentLogger);
    const result = await adapter.lookupBusinessAndCompetitors(baseInput);
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("permanent");
  });

  it("treats nearby empty result as a soft case (rank '>20', no error)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ places: [placeV1({ id: "place-A", name: "Wigan Plumbing" })] }),
      )
      .mockResolvedValueOnce(json(placeV1({ id: "place-A", name: "Wigan Plumbing" })))
      .mockResolvedValueOnce(json({ places: [] }));
    const adapter = createPlacesAdapter(config, silentLogger);
    const result = await adapter.lookupBusinessAndCompetitors(baseInput);
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.current_rank).toBe(">20");
      expect(result.value.competitors).toHaveLength(0);
    }
  });

  it("returns permanent error when api key is unset", async () => {
    const adapter = createPlacesAdapter({ GOOGLE_PLACES_API_KEY: undefined }, silentLogger);
    const result = await adapter.lookupBusinessAndCompetitors(baseInput);
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("permanent");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
