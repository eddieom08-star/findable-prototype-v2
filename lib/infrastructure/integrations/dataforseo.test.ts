import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDataForSeoAdapter } from "./dataforseo";
import { createLogger } from "@/lib/infrastructure/logger";

const silentLogger = createLogger({ LOG_LEVEL: "error" });
const config = { DATAFORSEO_LOGIN: "user@example.com", DATAFORSEO_PASSWORD: "secret123" };

const json = (body: object, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dataforseo adapter", () => {
  const baseInput = { trade: "plumber" as const, town: "Wigan" };

  it("returns the keyword volumes on a 20000 happy path", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [
              { keyword: "plumber", search_volume: 110 },
              { keyword: "emergency plumber", search_volume: 50 },
              { keyword: "boiler repair", search_volume: 20 },
              { keyword: "drain unblocking", search_volume: 30 },
            ],
          },
        ],
      }),
    );
    const adapter = createDataForSeoAdapter(config, silentLogger);
    const result = await adapter.fetchVolumes(baseInput);
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toHaveLength(4);
      expect(result.value[0]?.volume).toBe(110);
    }
  });

  it("sends Authorization Basic header + correct location_name + keyword_bundle", async () => {
    fetchMock.mockResolvedValueOnce(json({ status_code: 20000, tasks: [{ result: [] }] }));
    const adapter = createDataForSeoAdapter(config, silentLogger);
    await adapter.fetchVolumes(baseInput);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live",
    );
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toMatch(/^Basic /);
    const body = JSON.parse((init as RequestInit).body as string) as Array<{
      keywords: string[];
      location_name: string;
      language_code: string;
    }>;
    expect(body[0]?.location_name).toBe("Wigan,England,United Kingdom");
    expect(body[0]?.language_code).toBe("en");
    expect(body[0]?.keywords).toContain("plumber");
    expect(body[0]?.keywords).toContain("emergency plumber");
  });

  it("maps HTTP 402 (out of credit) to quota_exhausted", async () => {
    fetchMock.mockResolvedValueOnce(json({ status_code: 40300 }, 402));
    const adapter = createDataForSeoAdapter(config, silentLogger);
    const result = await adapter.fetchVolumes(baseInput);
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("quota_exhausted");
  });

  it("maps HTTP 429 (rate limit) to quota_exhausted", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 429));
    const adapter = createDataForSeoAdapter(config, silentLogger);
    const result = await adapter.fetchVolumes(baseInput);
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("quota_exhausted");
  });

  it("maps HTTP 401 to a permanent error (auth fail)", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401));
    const adapter = createDataForSeoAdapter(config, silentLogger);
    const result = await adapter.fetchVolumes(baseInput);
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("permanent");
  });

  it("retries on 5xx and recovers on the second attempt", async () => {
    fetchMock
      .mockImplementationOnce(async () => json({}, 502))
      .mockResolvedValueOnce(
        json({
          status_code: 20000,
          tasks: [{ status_code: 20000, result: [{ keyword: "plumber", search_volume: 110 }] }],
        }),
      );
    const adapter = createDataForSeoAdapter(config, silentLogger);
    const result = await adapter.fetchVolumes(baseInput);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.isOk).toBe(true);
  });

  it("maps body-level 40104 (account not verified) to permanent", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ status_code: 40104, status_message: "Please verify your account" }),
    );
    const adapter = createDataForSeoAdapter(config, silentLogger);
    const result = await adapter.fetchVolumes(baseInput);
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("permanent");
  });

  it("returns permanent error when credentials are unset", async () => {
    const adapter = createDataForSeoAdapter(
      { DATAFORSEO_LOGIN: undefined, DATAFORSEO_PASSWORD: undefined },
      silentLogger,
    );
    const result = await adapter.fetchVolumes(baseInput);
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.kind).toBe("permanent");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalises null search_volume to 0", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [{ keyword: "plumber", search_volume: null }],
          },
        ],
      }),
    );
    const adapter = createDataForSeoAdapter(config, silentLogger);
    const result = await adapter.fetchVolumes(baseInput);
    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.value[0]?.volume).toBe(0);
  });
});
