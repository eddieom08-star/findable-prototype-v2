import type { AppConfig } from "@/lib/infrastructure/config";
import type { Logger } from "@/lib/infrastructure/logger";
import type { TemplateStorePort } from "@/lib/application/ports";
import { createKvTemplateStore } from "./kv-template-store";
import { createMemoryTemplateStore } from "./memory-template-store";

export const createTemplateStore = (
  config: Pick<AppConfig, "KV_REST_API_URL" | "KV_REST_API_TOKEN">,
  logger?: Logger,
): TemplateStorePort => {
  if (config.KV_REST_API_URL !== undefined && config.KV_REST_API_TOKEN !== undefined) {
    return createKvTemplateStore({
      KV_REST_API_URL: config.KV_REST_API_URL,
      KV_REST_API_TOKEN: config.KV_REST_API_TOKEN,
    });
  }
  logger?.warn(
    "KV not configured — using in-memory template store (dev only).",
  );
  return createMemoryTemplateStore();
};
