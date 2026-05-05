import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { PreviewRequestSchema } from "@/lib/domain/schemas";
import { loadConfig } from "@/lib/infrastructure/config";
import { createLogger } from "@/lib/infrastructure/logger";
import { createCache } from "@/lib/infrastructure/cache";
import { createPostcodesIoAdapter } from "@/lib/infrastructure/integrations/postcodes-io";
import { createPlacesAdapter } from "@/lib/infrastructure/integrations/places";
import { createDataForSeoAdapter } from "@/lib/infrastructure/integrations/dataforseo";
import { createTemplateStore } from "@/lib/infrastructure/template-store";
import { loadTradeTemplate } from "@/lib/infrastructure/template-loader";
import { runPreview } from "@/lib/application/preview-usecase";
import { mapDomainErrorToHttp } from "@/lib/interface/http/error-mapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "lhr1";
export const maxDuration = 30;

const config = loadConfig();
const logger = createLogger(config);
const cache = createCache(config, logger);
const geo = createPostcodesIoAdapter(cache, logger);
const places = createPlacesAdapter(config, logger);
const volume = createDataForSeoAdapter(config, logger);
const templateStore = createTemplateStore(config, logger);
const clock = { now: () => new Date() };

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  const reqLogger = logger.child({ request_id: requestId, endpoint: "/api/preview" });
  const baseHeaders: Record<string, string> = {
    "X-Request-Id": requestId,
    "Cache-Control": "no-store",
  };

  try {
    const raw = (await req.json()) as unknown;
    const input = PreviewRequestSchema.parse(raw);

    reqLogger.info("preview request received", {
      trade: input.trade,
      postcode: input.postcode,
      avg_job_value: input.avg_job_value,
      phone: input.phone,
    });

    const result = await runPreview(
      input,
      {
        geo,
        places,
        volume,
        cache,
        templateStore,
        loadTemplate: loadTradeTemplate,
        appUrl: config.NEXT_PUBLIC_APP_URL,
        logger: reqLogger,
        clock,
      },
      requestId,
    );

    const elapsed = Math.round(performance.now() - started);

    if (result.isErr) {
      const mapped = mapDomainErrorToHttp(result.error, requestId);
      reqLogger.warn("preview returned domain error", {
        kind: result.error.kind,
        elapsed_ms: elapsed,
      });
      return NextResponse.json(mapped.body, {
        status: mapped.status,
        headers: { ...baseHeaders, "X-Cache-Status": "MISS" },
      });
    }

    reqLogger.info("preview ok", { elapsed_ms: elapsed, status: result.value.status });
    return NextResponse.json(result.value, {
      status: 200,
      headers: {
        ...baseHeaders,
        "X-Cache-Status": result.value.meta.cached ? "HIT" : "MISS",
        "Server-Timing": `total;dur=${elapsed}`,
      },
    });
  } catch (error) {
    const elapsed = Math.round(performance.now() - started);
    if (error instanceof ZodError) {
      reqLogger.info("validation failure", { issues: error.issues, elapsed_ms: elapsed });
      return NextResponse.json(
        {
          error: "validation",
          request_id: requestId,
          detail: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400, headers: baseHeaders },
      );
    }
    reqLogger.error("uncaught error", {
      elapsed_ms: elapsed,
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { value: String(error) },
    });
    return NextResponse.json(
      { error: "internal", request_id: requestId },
      { status: 500, headers: baseHeaders },
    );
  }
}
