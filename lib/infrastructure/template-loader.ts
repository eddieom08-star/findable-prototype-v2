import { readFileSync } from "node:fs";
import path from "node:path";
import type { Trade } from "@/lib/domain/schemas";

const cache = new Map<Trade, string>();

const PROJECT_ROOT = process.cwd();

export const loadTradeTemplate = (trade: Trade): string => {
  const cached = cache.get(trade);
  if (cached !== undefined) return cached;
  const file = path.join(PROJECT_ROOT, "templates", "per-trade", `${trade}.html`);
  const html = readFileSync(file, "utf-8");
  cache.set(trade, html);
  return html;
};
