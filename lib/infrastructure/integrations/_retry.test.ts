import { describe, it, expect } from "vitest";
import { Result } from "true-myth";
import { withRetry } from "./_retry";
import {
  httpError,
  permanentError,
  transientError,
} from "@/lib/domain/errors";

describe("withRetry", () => {
  it("returns Ok on first success without retry", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      return Result.ok<number, never>(42);
    });
    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.value).toBe(42);
    expect(calls).toBe(1);
  });

  it("retries once on transient error then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        return calls === 1
          ? Result.err(transientError(new Error("ECONNRESET")))
          : Result.ok<number, never>(7);
      },
      { delayMs: 0 },
    );
    expect(calls).toBe(2);
    expect(result.isOk).toBe(true);
  });

  it("retries 5xx and stops after maxAttempts", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        return Result.err(httpError(503, "service unavailable"));
      },
      { delayMs: 0, maxAttempts: 3 },
    );
    expect(calls).toBe(3);
    expect(result.isErr).toBe(true);
  });

  it("does not retry permanent errors", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        return Result.err(permanentError(new Error("invalid input")));
      },
      { delayMs: 0 },
    );
    expect(calls).toBe(1);
    expect(result.isErr).toBe(true);
  });

  it("does not retry 4xx http errors", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        return Result.err(httpError(400, "bad request"));
      },
      { delayMs: 0 },
    );
    expect(calls).toBe(1);
    expect(result.isErr).toBe(true);
  });
});
