import { NextResponse, type NextRequest } from "next/server";
import { loadConfig } from "@/lib/infrastructure/config";
import { createLogger } from "@/lib/infrastructure/logger";
import { createTemplateStore } from "@/lib/infrastructure/template-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "lhr1";

const config = loadConfig();
const logger = createLogger(config);
const store = createTemplateStore(config, logger);

interface Context {
  params: Promise<{ slug: string }>;
}

const NOT_FOUND_HTML = `<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><title>Preview not found</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#F5F0E6;color:#2A2520;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}h1{font-family:Georgia,serif;color:#1E3A5F;margin-bottom:8px}p{max-width:380px;line-height:1.5;color:#4a4339}</style></head><body><div><h1>This preview has expired.</h1><p>Findable previews stay live for 14 days. Generate a new one — same business, same details — and you'll get a fresh link.</p></div></body></html>`;

export async function GET(_req: NextRequest, ctx: Context): Promise<NextResponse> {
  const { slug } = await ctx.params;
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const result = await store.get(safeSlug);
  if (result.isNothing) {
    logger.info("preview html miss", { slug: safeSlug });
    return new NextResponse(NOT_FOUND_HTML, {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  return new NextResponse(result.value, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
