import { Result } from "true-myth";
import type { KeywordVolume, Trade } from "@/lib/domain/schemas";
import { TRADE_CONFIG } from "@/lib/domain/trade-config";
import type { AppConfig } from "@/lib/infrastructure/config";
import type { Logger } from "@/lib/infrastructure/logger";
import type { KeywordVolumePort } from "@/lib/application/ports";
import {
  type IntegrationError,
  httpError,
  permanentError,
  quotaExhaustedError,
  timeoutError,
  transientError,
} from "@/lib/domain/errors";
import { withRetry } from "./_retry";

const SEARCH_VOLUME_URL =
  "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";
const TIMEOUT_MS = 8_000;

interface DataForSeoTaskResult {
  readonly keyword: string;
  readonly search_volume?: number | null;
}

interface DataForSeoTask {
  readonly status_code?: number;
  readonly result?: readonly DataForSeoTaskResult[] | null;
}

interface DataForSeoResponse {
  readonly status_code?: number;
  readonly status_message?: string;
  readonly tasks?: readonly DataForSeoTask[];
}

const fetchWithTimeout = async (
  request: { url: string; init: RequestInit },
): Promise<Result<Response, IntegrationError>> => {
  const controller = new AbortController();
  const started = Date.now();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(request.url, { ...request.init, signal: controller.signal });
    return Result.ok(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return Result.err(timeoutError(Date.now() - started));
    }
    return Result.err(transientError(error, "dataforseo fetch failed"));
  } finally {
    clearTimeout(timer);
  }
};

const decodeJson = async <T>(response: Response): Promise<Result<T, IntegrationError>> => {
  try {
    return Result.ok((await response.json()) as T);
  } catch (error) {
    return Result.err(permanentError(error, "dataforseo response was not valid JSON"));
  }
};

const mapHttpError = (status: number, body: string): IntegrationError => {
  if (status === 401 || status === 403) return permanentError(body, `dataforseo: ${status}`);
  if (status === 402) return quotaExhaustedError("dataforseo");
  if (status === 429) return quotaExhaustedError("dataforseo");
  if (status >= 500) return httpError(status, body);
  return permanentError(body, `dataforseo: ${status}`);
};

const mapStatusCode = (statusCode: number | undefined, message?: string): IntegrationError | null => {
  if (statusCode === undefined) return null;
  if (statusCode === 20000) return null;
  if (statusCode === 40300 || statusCode === 40400) return quotaExhaustedError("dataforseo");
  if (statusCode === 40100 || statusCode === 40104 || statusCode === 40200) {
    return permanentError(message ?? "auth/account error", `dataforseo: ${statusCode}`);
  }
  if (statusCode >= 50000) return httpError(statusCode, message ?? "");
  return permanentError(message ?? "unknown error", `dataforseo: ${statusCode}`);
};

const buildLocationName = (town: string): string =>
  `${town},England,United Kingdom`;

const callDataForSeo = async (
  authHeader: string,
  trade: Trade,
  town: string,
): Promise<Result<DataForSeoResponse, IntegrationError>> => {
  const body = [
    {
      keywords: [...TRADE_CONFIG[trade].keyword_bundle],
      location_name: buildLocationName(town),
      language_code: "en",
    },
  ];
  const response = await fetchWithTimeout({
    url: SEARCH_VOLUME_URL,
    init: {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  });
  if (response.isErr) return Result.err(response.error);
  const res = response.value;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return Result.err(mapHttpError(res.status, text));
  }
  return decodeJson<DataForSeoResponse>(res);
};

const toKeywordVolumes = (
  payload: DataForSeoResponse,
): Result<readonly KeywordVolume[], IntegrationError> => {
  const taskErr = mapStatusCode(payload.status_code, payload.status_message);
  if (taskErr !== null) return Result.err(taskErr);
  const task = payload.tasks?.[0];
  if (task === undefined) {
    return Result.err(permanentError("dataforseo returned no tasks", "empty tasks"));
  }
  const taskStatusErr = mapStatusCode(task.status_code);
  if (taskStatusErr !== null) return Result.err(taskStatusErr);
  const results = task.result ?? [];
  const volumes: KeywordVolume[] = results.map((r) => ({
    keyword: r.keyword,
    volume: typeof r.search_volume === "number" ? r.search_volume : 0,
  }));
  return Result.ok(volumes);
};

const buildAuthHeader = (login: string, password: string): string => {
  const token = Buffer.from(`${login}:${password}`).toString("base64");
  return `Basic ${token}`;
};

export const createDataForSeoAdapter = (
  config: Pick<AppConfig, "DATAFORSEO_LOGIN" | "DATAFORSEO_PASSWORD">,
  logger: Logger,
): KeywordVolumePort => {
  const login = config.DATAFORSEO_LOGIN;
  const password = config.DATAFORSEO_PASSWORD;

  if (login === undefined || password === undefined) {
    return Object.freeze<KeywordVolumePort>({
      fetchVolumes: async () => {
        logger.warn("dataforseo adapter: credentials missing, signaling not_found");
        return Result.err(permanentError("credentials missing", "DATAFORSEO_LOGIN/PASSWORD"));
      },
    });
  }

  const authHeader = buildAuthHeader(login, password);

  const fetchVolumes: KeywordVolumePort["fetchVolumes"] = async ({ trade, town }) => {
    const callResult = await withRetry(() => callDataForSeo(authHeader, trade, town));
    if (callResult.isErr) return Result.err(callResult.error);
    const parsed = toKeywordVolumes(callResult.value);
    if (parsed.isOk) {
      logger.debug("dataforseo lookup ok", {
        trade,
        town,
        keyword_count: parsed.value.length,
      });
    }
    return parsed;
  };

  return Object.freeze<KeywordVolumePort>({ fetchVolumes });
};
