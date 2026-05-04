import type { DomainError } from "@/lib/domain/errors";

export interface HttpErrorPayload {
  readonly status: number;
  readonly body: { readonly error: string; readonly request_id: string; readonly detail?: unknown };
}

export const mapDomainErrorToHttp = (
  error: DomainError,
  requestId: string,
): HttpErrorPayload => {
  switch (error.kind) {
    case "validation":
      return {
        status: 400,
        body: { error: "validation", request_id: requestId, detail: error.issues },
      };
    case "business_not_found":
      return { status: 200, body: { error: "no_gbp", request_id: requestId } };
    case "rank_too_low":
      return {
        status: 200,
        body: { error: "rank_too_low", request_id: requestId, detail: { rank: error.rank } },
      };
    case "api_quota_exhausted":
      return {
        status: 503,
        body: { error: "quota_exhausted", request_id: requestId, detail: { source: error.source } },
      };
    case "api_timeout":
      return {
        status: 504,
        body: { error: "timeout", request_id: requestId, detail: { source: error.source } },
      };
    case "internal":
      return { status: 500, body: { error: "internal", request_id: requestId } };
  }
};
