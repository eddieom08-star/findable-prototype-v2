import { describe, expect, it } from "vitest";
import { normaliseTrade } from "./landing-trades";

describe("normaliseTrade", () => {
  it("matches plumber variants", () => {
    expect(normaliseTrade("plumber")).toBe("plumber");
    expect(normaliseTrade("Plumbing services")).toBe("plumber");
    expect(normaliseTrade("Boiler repair specialist")).toBe("plumber");
    expect(normaliseTrade("Heating engineer")).toBe("plumber");
    expect(normaliseTrade("gas safe engineer")).toBe("plumber");
  });

  it("matches electrician variants", () => {
    expect(normaliseTrade("Electrician")).toBe("electrician");
    expect(normaliseTrade("sparky")).toBe("electrician");
    expect(normaliseTrade("Rewires & EICR")).toBe("electrician");
    expect(normaliseTrade("NICEIC approved contractor")).toBe("electrician");
  });

  it("returns 'other' for unsupported trades", () => {
    expect(normaliseTrade("hairdresser")).toBe("other");
    expect(normaliseTrade("dog walker")).toBe("other");
    expect(normaliseTrade("baker")).toBe("other");
    expect(normaliseTrade("joiner / carpenter")).toBe("other");
  });

  it("returns 'other' for empty / whitespace input", () => {
    expect(normaliseTrade("")).toBe("other");
    expect(normaliseTrade("   ")).toBe("other");
  });

  it("is case-insensitive", () => {
    expect(normaliseTrade("PLUMBER")).toBe("plumber");
    expect(normaliseTrade("Electrician")).toBe("electrician");
  });
});
