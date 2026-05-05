"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CyclingPill } from "./CyclingPill";
import { TRADE_SUGGESTIONS, normaliseTrade } from "@/lib/domain/landing-trades";
import {
  captureUtms,
  clearFormDraft,
  getFormDraft,
  setFormDraft,
  setPreviewResponse,
  type FormDraft,
} from "@/lib/session-state";

interface FieldErrors {
  trade?: string;
  business_name?: string;
  postcode?: string;
  phone?: string;
  avg_job_value?: string;
}

const validate = (draft: FormDraft): FieldErrors => {
  const errors: FieldErrors = {};
  if (!draft.trade || draft.trade.trim() === "") {
    errors.trade = "Tell us your trade.";
  }
  if (!draft.business_name || draft.business_name.trim().length < 2) {
    errors.business_name = "Your business name.";
  }
  const postcode = (draft.postcode ?? "").trim();
  if (!/^[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}$/i.test(postcode)) {
    errors.postcode = "UK postcode only (e.g. WN1 2AB).";
  }
  const phone = (draft.phone ?? "").trim();
  if (!/^(?:\+44|0)\s*[\d\s-]{9,13}$/.test(phone)) {
    errors.phone = "UK phone (e.g. 07700 900123).";
  }
  const value = Number(draft.avg_job_value);
  if (!Number.isFinite(value) || value < 10 || value > 10000) {
    errors.avg_job_value = "Average job value (£10–£10,000).";
  }
  return errors;
};

export const HeroAndForm = (): React.ReactElement => {
  const router = useRouter();
  const [draft, setDraft] = useState<FormDraft>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    captureUtms(window.location.search);
    const existing = getFormDraft();
    setDraft(existing);
    setMoreOpen(existing.more_open ?? false);
    setHydrated(true);
  }, []);

  const update = <K extends keyof FormDraft>(field: K, value: FormDraft[K]): void => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    setFormDraft({ [field]: value } as FormDraft);
    if (errors[field as keyof FieldErrors]) {
      setErrors({ ...errors, [field]: undefined });
    }
  };

  const blurValidate = (field: keyof FieldErrors): void => {
    const v = validate(draft);
    setErrors({ ...errors, [field]: v[field] });
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const v = validate(draft);
    setErrors(v);
    if (Object.values(v).some((x) => x !== undefined)) return;

    const tradeNormalised = normaliseTrade(draft.trade ?? "");
    if (tradeNormalised === "other") {
      setSubmitError(
        `We're starting with plumbers and electricians. We've added ${draft.trade} to the waitlist — we'll email when we open up.`,
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        business_name: (draft.business_name ?? "").trim(),
        postcode: (draft.postcode ?? "").trim(),
        phone: (draft.phone ?? "").trim(),
        avg_job_value: Number(draft.avg_job_value),
        trade: tradeNormalised,
        ...(draft.jobs_per_month ? { jobs_per_month: draft.jobs_per_month } : {}),
        ...(draft.website ? { website: draft.website.trim() } : {}),
      };
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSubmitError(
          body.error === "validation"
            ? "Some fields look off — double-check and try again."
            : "Something went wrong on our end. Try again in a moment.",
        );
        setSubmitting(false);
        return;
      }
      const response = await res.json();
      setPreviewResponse(response);
      clearFormDraft();
      router.push(`/build?slug=${encodeURIComponent(response.business?.place_id ?? "preview")}`);
    } catch {
      setSubmitError("Network error. Check your connection and try again.");
      setSubmitting(false);
    }
  };

  return (
    <section className="px-10 py-16 max-w-[1280px] mx-auto md:px-10 md:py-20 max-md:px-6 max-md:py-12">
      <CyclingPill />

      <h1 className="font-display text-[clamp(40px,7vw,76px)] mb-6 text-[color:var(--ink)] max-w-[880px]">
        See what your <span className="line-through decoration-[rgba(232,90,31,0.4)] decoration-[5px] text-[color:var(--muted)] font-normal not-italic">website</span>{" "}
        <span className="font-display-italic text-[color:var(--orange)] italic">invisibility</span> is costing you.
      </h1>

      <p className="text-[19px] leading-[1.5] text-[color:var(--ink-soft)] mb-10 max-w-[660px]">
        The competitors ranking above you on Google and AI search are taking your jobs every single day. In 60 seconds we&apos;ll show you exactly how many, what they&apos;re worth, and a full website preview with your name on it.{" "}
        <strong className="text-[color:var(--ink)] font-semibold">No email needed. No catch.</strong>
      </p>

      <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-10 md:gap-[60px] items-start">
        <form
          className="bg-white border border-[color:var(--rule)] rounded-[18px] p-6 md:p-8 shadow-[0_12px_40px_-16px_rgba(20,17,15,0.08)]"
          onSubmit={onSubmit}
          noValidate
        >
          <Field
            label="What do you do?"
            help="Type your trade. We'll personalise the loss numbers based on it."
            error={errors.trade}
          >
            <input
              type="text"
              className="form-input"
              placeholder="e.g. plumber, electrician…"
              value={draft.trade ?? ""}
              onChange={(e) => update("trade", e.target.value)}
              onBlur={() => blurValidate("trade")}
              list="tradeSuggestions"
              autoComplete="off"
              required
            />
            <datalist id="tradeSuggestions">
              {TRADE_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>

          <Field label="Your business name" error={errors.business_name}>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Joe&apos;s Plumbing Services"
              value={draft.business_name ?? ""}
              onChange={(e) => update("business_name", e.target.value)}
              onBlur={() => blurValidate("business_name")}
              autoComplete="organization"
              required
            />
          </Field>

          <Field label="Postcode" error={errors.postcode}>
            <input
              type="text"
              className="form-input"
              placeholder="WN1 2AB"
              value={draft.postcode ?? ""}
              onChange={(e) => update("postcode", e.target.value)}
              onBlur={() => blurValidate("postcode")}
              autoComplete="postal-code"
              inputMode="text"
              required
            />
          </Field>

          <Field
            label="Phone number"
            help="So we can find your Google Business Profile and add a click-to-call button to your preview."
            error={errors.phone}
          >
            <input
              type="tel"
              className="form-input"
              placeholder="07700 900123"
              value={draft.phone ?? ""}
              onChange={(e) => update("phone", e.target.value)}
              onBlur={() => blurValidate("phone")}
              autoComplete="tel"
              inputMode="tel"
              required
            />
          </Field>

          <Field
            label="Average job value"
            help="A typical callout, repair, or service. Be honest — the maths needs it."
            error={errors.avg_job_value}
          >
            <div className="relative">
              <span className="absolute left-[14px] top-1/2 -translate-y-1/2 text-[color:var(--muted)] font-medium z-10">
                £
              </span>
              <input
                type="number"
                className="form-input pl-7"
                placeholder="180"
                min={10}
                max={10000}
                value={draft.avg_job_value ?? ""}
                onChange={(e) => update("avg_job_value", e.target.value)}
                onBlur={() => blurValidate("avg_job_value")}
                inputMode="numeric"
                required
              />
            </div>
          </Field>

          <button
            type="button"
            className="flex items-center gap-2 text-[13px] text-[color:var(--orange-deep)] py-3 font-semibold cursor-pointer"
            onClick={() => {
              const next = !moreOpen;
              setMoreOpen(next);
              setFormDraft({ more_open: next });
            }}
          >
            Want a more accurate number? Tell us a bit more
            <span className={`transition-transform ${moreOpen ? "rotate-180" : ""}`}>↓</span>
          </button>

          {moreOpen && (
            <div className="pt-2">
              <Field label="How many jobs do you do in a typical month?">
                <div className="flex gap-2 flex-wrap">
                  {(["under_20", "20_50", "50_100", "100_plus"] as const).map((v) => {
                    const labels: Record<string, string> = {
                      under_20: "Under 20",
                      "20_50": "20–50",
                      "50_100": "50–100",
                      "100_plus": "100+",
                    };
                    const selected = draft.jobs_per_month === v;
                    return (
                      <button
                        type="button"
                        key={v}
                        className={`px-[14px] py-2 rounded-full text-[13px] cursor-pointer border-[1.5px] transition-all ${
                          selected
                            ? "bg-[color:var(--ink)] text-white border-[color:var(--ink)]"
                            : "bg-[color:var(--cream)] text-[color:var(--ink-soft)] border-[color:var(--rule)] hover:border-[color:var(--ink-soft)]"
                        }`}
                        onClick={() => update("jobs_per_month", v)}
                      >
                        {labels[v]}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Your website (if you have one)">
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://your-business.co.uk"
                  value={draft.website ?? ""}
                  onChange={(e) => update("website", e.target.value)}
                  autoComplete="url"
                />
              </Field>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !hydrated}
            className="w-full px-6 py-[18px] bg-[color:var(--orange)] hover:bg-[color:var(--orange-deep)] disabled:opacity-60 disabled:cursor-not-allowed text-white border-0 rounded-[10px] text-[17px] font-semibold cursor-pointer mt-4 shadow-[0_6px_20px_-8px_rgba(232,90,31,0.5)] transition-all"
          >
            {submitting ? "Working on it…" : "Show me what I'm losing"}
          </button>

          <div className="flex gap-[18px] mt-4 flex-wrap text-[12px] text-[color:var(--muted)] tracking-[0.02em]">
            <span className="before:content-['✓_'] before:text-[color:var(--green)] before:font-bold">60 seconds</span>
            <span className="before:content-['✓_'] before:text-[color:var(--green)] before:font-bold">No email yet</span>
            <span className="before:content-['✓_'] before:text-[color:var(--green)] before:font-bold">No sales call</span>
          </div>

          {submitError && (
            <p className="mt-3 text-[13px] text-[color:var(--orange-deep)]">{submitError}</p>
          )}

          <p className="text-[11px] leading-[1.5] text-[color:var(--muted)] mt-5 pt-4 border-t border-[color:var(--rule)] italic">
            Estimates only. We use public data to size your potential. The real picture comes from a full audit of your site, Google profile, reviews, and competitors.
          </p>
        </form>

        <aside className="bg-[color:var(--cream-deep)] border border-[color:var(--rule)] rounded-[18px] p-7">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)] mb-5">
            What you&apos;ll see in 60 seconds
          </div>
          {[
            {
              n: "01",
              title: "Your monthly recoverable revenue",
              body: "Worked out from real local search data and your average job value. Personalised to your trade. Shown with the maths so you can argue with it.",
            },
            {
              n: "02",
              title: "Your three biggest local competitors",
              body: "The businesses ranking above you on Google and what they're doing differently.",
            },
            {
              n: "03",
              title: "A real preview website with your name on it",
              body: "Real photos, real reviews, real services. Live at a real URL you can share.",
            },
          ].map((item) => (
            <div
              key={item.n}
              className="flex gap-[14px] py-[14px] border-b border-[color:var(--rule)] last:border-b-0"
            >
              <div className="font-display font-semibold text-[22px] text-[color:var(--orange)] min-w-8">
                {item.n}
              </div>
              <div>
                <strong className="block text-[16px] text-[color:var(--ink)] mb-1">{item.title}</strong>
                <p className="text-[14px] text-[color:var(--ink-soft)] leading-[1.5]">{item.body}</p>
              </div>
            </div>
          ))}
        </aside>
      </div>

      <style>{`
        .form-input {
          width: 100%;
          padding: 14px 16px;
          border: 1.5px solid var(--rule);
          border-radius: 10px;
          font-family: inherit;
          font-size: 16px;
          color: var(--ink);
          background: var(--cream);
          transition: border-color 0.2s ease;
          outline: none;
        }
        .form-input:focus {
          border-color: var(--orange);
          background: #fff;
        }
      `}</style>
    </section>
  );
};

interface FieldProps {
  label: string;
  help?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}

const Field = ({ label, help, error, children }: FieldProps): React.ReactElement => (
  <div className="mb-[18px]">
    <label className="block text-[13px] text-[color:var(--muted)] mb-2 font-medium tracking-[0.02em]">
      {label}
    </label>
    {children}
    {help && !error && <p className="text-[12px] text-[color:var(--muted)] mt-[6px]">{help}</p>}
    {error && <p className="text-[12px] text-[color:var(--orange-deep)] mt-[6px]">{error}</p>}
  </div>
);
