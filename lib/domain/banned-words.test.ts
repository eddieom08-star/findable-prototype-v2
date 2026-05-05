import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGETS: readonly string[] = [
  "templates/per-trade/plumber.html",
  "templates/per-trade/electrician.html",
  "app/page.tsx",
  "app/components/HeroAndForm.tsx",
  "app/components/CyclingPill.tsx",
  "app/build/page.tsx",
  "app/reveal/[slug]/page.tsx",
];

const BANNED: ReadonlyArray<readonly [string, RegExp]> = [
  ["solutions", /\bsolutions\b/i],
  ["innovative", /\binnovative\b/i],
  ["leverage", /\bleverage\b/i],
  ["synergy", /\bsynergy\b/i],
  ["ecosystem", /\becosystem\b/i],
  ["journey", /\bjourney\b/i],
  ["holistic", /\bholistic\b/i],
  ["optimise", /\boptimise\b/i],
];

describe("banned-words sweep", () => {
  it.each(TARGETS)("%s contains no banned marketing words", (rel) => {
    const file = path.join(ROOT, rel);
    const content = readFileSync(file, "utf-8");
    for (const [word, re] of BANNED) {
      const match = re.exec(content);
      expect(match, `'${word}' found in ${rel}`).toBeNull();
    }
  });
});
