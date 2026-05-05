import type { Trade } from "./schemas";

export interface TradeSuggestion {
  readonly value: string;
  readonly normalised: Trade | "other";
}

export const PILL_TRADES: readonly string[] = [
  "Plumbers",
  "Electricians",
  "Hairdressers",
  "Dog walkers",
  "Bakers",
  "Gardeners",
];

export const TRADE_SUGGESTIONS: readonly string[] = [
  "Plumber",
  "Electrician",
  "Hairdresser",
  "Dog walker",
  "Baker",
  "Gardener",
  "Joiner / carpenter",
  "Roofer",
  "Painter & decorator",
  "Locksmith",
];

const KEYWORD_TO_TRADE: ReadonlyArray<readonly [readonly string[], Trade]> = [
  [
    [
      "plumb",
      "boiler",
      "drain",
      "leak",
      "pipe",
      "gas safe",
      "heating engineer",
      "central heating",
    ],
    "plumber",
  ],
  [
    [
      "electric",
      "electrician",
      "sparky",
      "rewire",
      "fuse box",
      "consumer unit",
      "eicr",
      "niceic",
      "pat test",
    ],
    "electrician",
  ],
];

export const normaliseTrade = (raw: string): Trade | "other" => {
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === "") return "other";
  for (const [keywords, trade] of KEYWORD_TO_TRADE) {
    for (const k of keywords) {
      if (cleaned.includes(k)) return trade;
    }
  }
  return "other";
};
