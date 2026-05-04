import { Result } from "true-myth";
import {
  type IntegrationError,
  isRetryableIntegrationError,
} from "@/lib/domain/errors";

export interface RetryOptions {
  readonly maxAttempts?: number;
  readonly delayMs?: number;
  readonly shouldRetry?: (error: IntegrationError, attempt: number) => boolean;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const withRetry = async <T>(
  fn: () => Promise<Result<T, IntegrationError>>,
  options: RetryOptions = {},
): Promise<Result<T, IntegrationError>> => {
  const maxAttempts = options.maxAttempts ?? 2;
  const delayMs = options.delayMs ?? 500;
  const shouldRetry = options.shouldRetry ?? isRetryableIntegrationError;

  const attempt = async (n: number): Promise<Result<T, IntegrationError>> => {
    const outcome = await fn();
    if (outcome.isOk) return outcome;
    if (n >= maxAttempts || !shouldRetry(outcome.error, n)) return outcome;
    await sleep(delayMs);
    return attempt(n + 1);
  };

  return attempt(1);
};
