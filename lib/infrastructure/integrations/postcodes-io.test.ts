import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostcodesIoAdapter } from "./postcodes-io";
import { createMemoryCache } from "@/lib/infrastructure/cache/memory-cache";
import { createLogger } from "@/lib/infrastructure/logger";

const silentLogger = createLogger({ LOG_LEVEL: "error" });

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const wiganPayload = {
  result: {
    postcode: "WN1 2AB",
    latitude: 53.5417,
    longitude: -2.6321,
    admin_district: "Wigan",
    admin_county: "Greater Manchester",
    country: "England",
  },
};

describe("postcodes.io adapter", () => {
  it("returns Ok with town/county/lat/lng on a valid postcode", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(wiganPayload), { status: 200 }),
    );
    const adapter = createPostcodesIoAdapter(createMemoryCache(), silentLogger);
    const result = await adapter.lookup("WN1 2AB");
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.town).toBe("Wigan");
      expect(result.value.county).toBe("Greater Manchester");
      expect(result.value.lat).toBeCloseTo(53.5417, 4);
      expect(result.value.lng).toBeCloseTo(-2.6321, 4);
    }
  });

  it("returns a permanent error on 404", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Not found", { status: 404 }));
    const adapter = createPostcodesIoAdapter(createMemoryCache(), silentLogger);
    const result = await adapter.lookup("ZZ99 9ZZ");
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("permanent");
  });

  it("retries on 5xx and recovers on the second attempt", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("err", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(wiganPayload), { status: 200 }));
    const adapter = createPostcodesIoAdapter(createMemoryCache(), silentLogger);
    const result = await adapter.lookup("WN1 2AB");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.isOk).toBe(true);
  });

  it("returns http error after exhausting retries on 5xx", async () => {
    fetchMock.mockImplementation(async () => new Response("err", { status: 503 }));
    const adapter = createPostcodesIoAdapter(createMemoryCache(), silentLogger);
    const result = await adapter.lookup("WN1 2AB");
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("http");
  });

  it("returns the cached result on second call without re-fetching", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(wiganPayload), { status: 200 }),
    );
    const cache = createMemoryCache();
    const adapter = createPostcodesIoAdapter(cache, silentLogger);
    const first = await adapter.lookup("WN1 2AB");
    const second = await adapter.lookup("WN1 2AB");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.isOk).toBe(true);
    expect(second.isOk).toBe(true);
  });

  it("normalises empty result body to permanent error", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ result: null }), { status: 200 }),
    );
    const adapter = createPostcodesIoAdapter(createMemoryCache(), silentLogger);
    const result = await adapter.lookup("WN1 2AB");
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("permanent");
  });
});
