export interface RetryOptions {
  retries?: number;
  delayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export class HttpStatusError extends Error {
  constructor(public status: number, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = "HttpStatusError";
  }
}

const isTransient = (error: unknown): boolean => {
  if (error instanceof HttpStatusError) return error.status >= 500 && error.status < 600;
  if (error instanceof TypeError) return true;
  if (error instanceof Error && /timeout|network|fetch failed|ECONN/i.test(error.message)) return true;
  return false;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 1;
  const delayMs = options.delayMs ?? 500;
  const shouldRetry = options.shouldRetry ?? ((error) => isTransient(error));

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error, attempt)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
