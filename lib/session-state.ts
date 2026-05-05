"use client";

import type { PreviewResponse } from "@/lib/domain/schemas";

const SESSION_KEY = "findable_session";
const FORM_DRAFT_KEY = "findable_form_draft";
const PREVIEW_RESPONSE_KEY = "findable_preview_response";
const EMAIL_CAPTURED_KEY = "findable_email_captured";

export interface SessionState {
  readonly utm_source?: string;
  readonly utm_medium?: string;
  readonly utm_campaign?: string;
  readonly utm_content?: string;
  readonly v?: string;
  readonly ref?: string;
  readonly started_at?: string;
}

export interface FormDraft {
  readonly trade?: string;
  readonly business_name?: string;
  readonly postcode?: string;
  readonly phone?: string;
  readonly avg_job_value?: string;
  readonly jobs_per_month?: string;
  readonly website?: string;
  readonly more_open?: boolean;
}

const isBrowser = (): boolean => typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

const safeRead = <T>(key: string): T | null => {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const safeWrite = (key: string, value: unknown): void => {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or storage disabled — ignore silently
  }
};

const safeRemove = (key: string): void => {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
};

export const getSession = (): SessionState =>
  safeRead<SessionState>(SESSION_KEY) ?? {};

export const setSession = (next: SessionState): void => {
  const merged = { ...getSession(), ...next };
  safeWrite(SESSION_KEY, merged);
};

export const getFormDraft = (): FormDraft =>
  safeRead<FormDraft>(FORM_DRAFT_KEY) ?? {};

export const setFormDraft = (next: FormDraft): void => {
  const merged = { ...getFormDraft(), ...next };
  safeWrite(FORM_DRAFT_KEY, merged);
};

export const clearFormDraft = (): void => {
  safeRemove(FORM_DRAFT_KEY);
};

export const getPreviewResponse = (): PreviewResponse | null =>
  safeRead<PreviewResponse>(PREVIEW_RESPONSE_KEY);

export const setPreviewResponse = (response: PreviewResponse): void => {
  safeWrite(PREVIEW_RESPONSE_KEY, response);
};

export const clearPreviewResponse = (): void => {
  safeRemove(PREVIEW_RESPONSE_KEY);
};

export const isEmailCaptured = (): boolean =>
  safeRead<boolean>(EMAIL_CAPTURED_KEY) === true;

export const markEmailCaptured = (): void => {
  safeWrite(EMAIL_CAPTURED_KEY, true);
};

const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "v", "ref"] as const;

export const captureUtms = (search: string): void => {
  if (!isBrowser()) return;
  const existing = getSession();
  if (existing.utm_source || existing.utm_campaign) return;
  const params = new URLSearchParams(search);
  const captured: Partial<SessionState> = {};
  let any = false;
  for (const key of UTM_PARAMS) {
    const value = params.get(key);
    if (value !== null && value !== "") {
      (captured as Record<string, string>)[key] = value;
      any = true;
    }
  }
  if (any) {
    setSession({
      ...captured,
      ...(existing.started_at ? {} : { started_at: new Date().toISOString() }),
    });
  }
};
