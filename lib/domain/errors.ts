export type IntegrationError =
  | { readonly kind: "transient"; readonly cause: unknown; readonly hint?: string }
  | { readonly kind: "timeout"; readonly elapsedMs: number }
  | { readonly kind: "http"; readonly status: number; readonly cause: unknown }
  | { readonly kind: "permanent"; readonly cause: unknown; readonly hint?: string }
  | { readonly kind: "not_found"; readonly hint?: string }
  | { readonly kind: "quota_exhausted"; readonly source: string };

export const transientError = (cause: unknown, hint?: string): IntegrationError =>
  hint === undefined ? { kind: "transient", cause } : { kind: "transient", cause, hint };

export const timeoutError = (elapsedMs: number): IntegrationError => ({
  kind: "timeout",
  elapsedMs,
});

export const httpError = (status: number, cause: unknown): IntegrationError => ({
  kind: "http",
  status,
  cause,
});

export const permanentError = (cause: unknown, hint?: string): IntegrationError =>
  hint === undefined ? { kind: "permanent", cause } : { kind: "permanent", cause, hint };

export const notFoundError = (hint?: string): IntegrationError =>
  hint === undefined ? { kind: "not_found" } : { kind: "not_found", hint };

export const quotaExhaustedError = (source: string): IntegrationError => ({
  kind: "quota_exhausted",
  source,
});

export const isRetryableIntegrationError = (e: IntegrationError): boolean => {
  switch (e.kind) {
    case "transient":
    case "timeout":
      return true;
    case "http":
      return e.status >= 500 && e.status < 600;
    case "permanent":
    case "not_found":
    case "quota_exhausted":
      return false;
  }
};

export type DomainError =
  | { readonly kind: "validation"; readonly issues: readonly { path: string; message: string }[] }
  | { readonly kind: "business_not_found" }
  | { readonly kind: "rank_too_low"; readonly rank: number }
  | { readonly kind: "api_quota_exhausted"; readonly source: "places" | "dataforseo" }
  | { readonly kind: "api_timeout"; readonly source: string }
  | { readonly kind: "internal"; readonly cause: unknown };
