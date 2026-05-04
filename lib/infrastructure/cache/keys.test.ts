import { describe, it, expect } from "vitest";
import { cacheKey, normalisePostcode, normaliseTown, slugify } from "./keys";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Wigan Plumbing Co")).toBe("wigan-plumbing-co");
  });
  it("strips punctuation", () => {
    expect(slugify("A&E 24/7 Plumbers!")).toBe("a-e-24-7-plumbers");
  });
  it("trims leading and trailing separators", () => {
    expect(slugify("---hello---")).toBe("hello");
  });
});

describe("normalisePostcode", () => {
  it("uppercases and inserts the canonical space", () => {
    expect(normalisePostcode("wn12ab")).toBe("WN1 2AB");
  });
  it("collapses extra whitespace", () => {
    expect(normalisePostcode("  WN1   2AB  ")).toBe("WN1 2AB");
  });
});

describe("normaliseTown", () => {
  it("hyphenates and lowercases", () => {
    expect(normaliseTown("Newcastle upon Tyne")).toBe("newcastle-upon-tyne");
  });
});

describe("cacheKey", () => {
  it("formats the preview key", () => {
    expect(cacheKey.preview("Wigan Plumbing Co", "wn1 2ab")).toBe(
      "preview:wigan-plumbing-co:WN1 2AB",
    );
  });
  it("formats the volume key", () => {
    expect(cacheKey.volume("plumber", "Newcastle upon Tyne")).toBe(
      "volume:plumber:newcastle-upon-tyne",
    );
  });
  it("formats the geo key", () => {
    expect(cacheKey.geo("wn12ab")).toBe("geo:WN1 2AB");
  });
});
