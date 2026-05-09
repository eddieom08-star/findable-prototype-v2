"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getPreviewResponse } from "@/lib/session-state";

const formatPounds = (n: number): string =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);

export default function RevealPage(): React.ReactElement {
  const router = useRouter();
  const [response, setResponse] = useState<ReturnType<typeof getPreviewResponse>>(null);
  const [conversion, setConversion] = useState(0.35);
  const [showMaths, setShowMaths] = useState(false);

  useEffect(() => {
    const r = getPreviewResponse();
    if (r === null) {
      router.replace("/");
      return;
    }
    setResponse(r);
    setConversion(r.loss.formula_inputs.conversion_rate);
  }, [router]);

  const recomputed = useMemo(() => {
    if (response === null) return null;
    const fi = response.loss.formula_inputs;
    const clicks = fi.total_searches * fi.gap_ctr;
    const monthly = Math.round(clicks * conversion * fi.avg_job_value);
    return Math.min(monthly, 8000);
  }, [conversion, response]);

  if (response === null) return <main className="min-h-[60vh]" />;

  const isAnnual = (recomputed ?? response.loss.monthly_pounds) < 400;
  const displayValue = isAnnual
    ? (recomputed ?? response.loss.monthly_pounds) * 12
    : recomputed ?? response.loss.monthly_pounds;
  const displaySuffix = isAnnual ? " / year" : " / month";

  const tier =
    response.loss.monthly_pounds < 1000
      ? { name: "Starter", price: 79 }
      : response.loss.monthly_pounds < 3000
        ? { name: "Growth", price: 179 }
        : { name: "Pro", price: 349 };

  return (
    <main className="pb-24">
      {/* TOP — loss reveal on navy */}
      <section className="bg-[color:var(--navy)] text-[color:var(--cream)] px-6 md:px-10 py-12 md:py-16">
        <div className="max-w-[920px] mx-auto">
          <p className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--cream)]/70 mb-4">
            {response.business.name} · {response.geo.town}
          </p>
          <h1 className="font-display-italic text-[60px] md:text-[110px] leading-none mb-2">
            {formatPounds(displayValue)}
          </h1>
          <p className="text-[18px] md:text-[22px] text-[color:var(--cream)]/85 mb-8">
            {isAnnual ? "Recoverable, every year." : "Recoverable, every single month."}
          </p>

          {response.status === "no_gbp" && (
            <p className="bg-[color:var(--orange)]/15 border border-[color:var(--orange)] text-[color:var(--cream)] p-4 rounded-lg mb-6 text-[14px]">
              We couldn&apos;t find your Google Business Profile yet. The number above is what plumbers your size in {response.geo.town} typically miss.
            </p>
          )}
          {response.status === "rank_too_low" && (
            <p className="bg-[color:var(--orange)]/15 border border-[color:var(--orange)] text-[color:var(--cream)] p-4 rounded-lg mb-6 text-[14px]">
              You&apos;re nowhere on Google for plumber in {response.geo.town}. That IS the headline.
            </p>
          )}

          <button
            type="button"
            className="text-[14px] underline decoration-[color:var(--cream)]/40 underline-offset-4 mb-4"
            onClick={() => setShowMaths(!showMaths)}
          >
            {showMaths ? "Hide the maths" : "Show me the maths"}
          </button>

          {showMaths && (
            <div className="bg-[color:var(--cream)]/5 border border-[color:var(--cream)]/15 rounded-lg p-5 text-[14px] space-y-2 mb-6">
              <Row k="Monthly searches in your town" v={response.search.total_monthly_volume.toLocaleString()} />
              <Row k="Top-3 target click-through rate" v={`${(response.loss.formula_inputs.target_ctr * 100).toFixed(0)}%`} />
              <Row k="Your current click-through rate" v={`${(response.loss.formula_inputs.current_ctr * 100).toFixed(2)}%`} />
              <Row k="Your current rank" v={String(response.competitors.current_rank)} />
              <Row k="Recoverable clicks / month" v={response.loss.recoverable_clicks_per_month.toLocaleString()} />
              <Row k="Average job value" v={formatPounds(response.loss.formula_inputs.avg_job_value)} />
              <div className="pt-3 border-t border-[color:var(--cream)]/15">
                <label className="block text-[12px] text-[color:var(--cream)]/70 mb-2">
                  Lead-to-job conversion (drag to recompute)
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={0.8}
                  step={0.05}
                  value={conversion}
                  onChange={(e) => setConversion(Number(e.target.value))}
                  className="w-full accent-[color:var(--orange)]"
                />
                <div className="text-[12px] text-[color:var(--cream)]/70 mt-1">
                  {(conversion * 100).toFixed(0)}% of clicks become paying jobs
                </div>
              </div>
              <p className="text-[11px] text-[color:var(--cream)]/55 italic mt-3">
                Source: {response.search.volume_source === "dataforseo" ? "DataForSEO" : "Population-scaled estimate"} · CTR by rank from Sistrix 2023 + Backlinko 2024 · As of {response.meta.as_of_date}.
              </p>
            </div>
          )}

          <div className="text-[12px] italic text-[color:var(--cream)]/65">
            Estimate based on public Google data and industry conversion benchmarks. The real picture comes from a full audit of your site, profile, reviews, and competitors.
          </div>
        </div>
      </section>

      {/* BOTTOM — preview iframe + competitors */}
      <section className="px-6 md:px-10 py-12 md:py-16">
        <div className="max-w-[920px] mx-auto">
          {response.competitors.top_3.length > 0 && (
            <div className="mb-10">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)] mb-3">
                The top 3 above you on Google
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {response.competitors.top_3.map((c, i) => (
                  <li key={i} className="bg-white border border-[color:var(--rule)] rounded-lg p-4">
                    <div className="text-[15px] font-semibold text-[color:var(--ink)]">{c.name}</div>
                    {c.rating !== null && (
                      <div className="text-[13px] text-[color:var(--muted)] mt-1">
                        ★ {c.rating} · {c.review_count ?? "—"} reviews
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {response.preview_url && (
            <>
              <p className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)] mb-3">
                A real preview website with your name on it
              </p>
              <div className="rounded-lg overflow-hidden border border-[color:var(--rule)] bg-white shadow-[0_12px_40px_-16px_rgba(20,17,15,0.08)]">
                <iframe
                  src={response.preview_url}
                  title="Your Findable preview site"
                  className="w-full h-[1800px]"
                  loading="lazy"
                  sandbox="allow-same-origin allow-popups"
                />
              </div>
              <div className="mt-3 flex gap-3 flex-wrap items-center text-[13px]">
                <button
                  type="button"
                  className="text-[color:var(--orange-deep)] underline underline-offset-4"
                  onClick={() => navigator.clipboard?.writeText(response.preview_url ?? "")}
                >
                  Copy preview link
                </button>
                <a
                  href={response.preview_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[color:var(--ink-soft)] underline underline-offset-4"
                >
                  Open full screen
                </a>
              </div>
            </>
          )}
        </div>
      </section>

      {/* STICKY CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[color:var(--rule)] px-6 py-4 shadow-[0_-12px_40px_-16px_rgba(20,17,15,0.08)] z-40">
        <div className="max-w-[920px] mx-auto flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="text-[14px]">
            <strong className="text-[color:var(--ink)]">Make this live, in your name.</strong>
            <span className="text-[color:var(--muted)] ml-2">
              {tier.name} plan — £{tier.price}/mo, no setup fee.
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-5 py-3 bg-[color:var(--orange)] hover:bg-[color:var(--orange-deep)] text-white rounded-full text-[14px] font-semibold"
            >
              Make this live · £{tier.price}/mo
            </button>
            <button
              type="button"
              className="px-5 py-3 border border-[color:var(--rule)] text-[color:var(--ink-soft)] rounded-full text-[14px]"
            >
              Talk to someone first
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

const Row = ({ k, v }: { k: string; v: string }): React.ReactElement => (
  <div className="flex justify-between gap-4">
    <span className="text-[color:var(--cream)]/65">{k}</span>
    <span className="text-[color:var(--cream)] font-medium tabular-nums">{v}</span>
  </div>
);
