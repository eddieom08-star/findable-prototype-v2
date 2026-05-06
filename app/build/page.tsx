"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPreviewResponse } from "@/lib/session-state";

export const dynamic = "force-dynamic";

const BEATS = [
  "Found your Google Business Profile",
  "Looking up the top-3 plumbers near you",
  "Pulling local search volumes",
  "Working out what you're missing",
  "Building your preview site",
];

const BEAT_DURATION_MS = 1800;

const slugFromResponse = (preview_url: string | null): string => {
  if (preview_url === null) return "preview";
  try {
    const url = new URL(preview_url);
    const last = url.pathname.split("/").filter(Boolean).pop();
    return last ?? "preview";
  } catch {
    return "preview";
  }
};

export default function BuildPage(): React.ReactElement {
  const router = useRouter();
  const [beat, setBeat] = useState(0);
  const [response, setResponse] = useState<ReturnType<typeof getPreviewResponse>>(null);

  useEffect(() => {
    const r = getPreviewResponse();
    setResponse(r);
    if (r === null) {
      router.replace("/");
      return;
    }
  }, [router]);

  useEffect(() => {
    if (response === null) return;
    if (beat < BEATS.length - 1) {
      const id = window.setTimeout(() => setBeat(beat + 1), BEAT_DURATION_MS);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      router.push(`/reveal/${slugFromResponse(response.preview_url)}`);
    }, BEAT_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [beat, response, router]);

  return (
    <main className="min-h-[80vh] flex flex-col items-center justify-center px-6">
      <div className="max-w-[480px] w-full">
        <p className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)] mb-4">
          Generating your preview
        </p>
        <h1 className="font-display text-[32px] md:text-[44px] mb-10 text-[color:var(--ink)] leading-tight">
          We&apos;re digging into the public data on your business.
        </h1>
        <ul className="space-y-3">
          {BEATS.map((label, i) => {
            const state = i < beat ? "done" : i === beat ? "working" : "idle";
            return (
              <li
                key={label}
                className={`flex items-center gap-3 py-2 transition-colors ${
                  state === "idle"
                    ? "text-[color:var(--muted)]"
                    : "text-[color:var(--ink)]"
                }`}
              >
                <span
                  className={`inline-flex w-5 h-5 items-center justify-center rounded-full text-[11px] font-bold ${
                    state === "done"
                      ? "bg-[color:var(--green)] text-white"
                      : state === "working"
                        ? "bg-[color:var(--orange)] text-white animate-pulse"
                        : "bg-[color:var(--cream-deep)] text-[color:var(--muted)] border border-[color:var(--rule)]"
                  }`}
                >
                  {state === "done" ? "✓" : i + 1}
                </span>
                <span className="text-[15px]">{label}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-[color:var(--muted)] mt-12 italic">
          Working from public Google data — we&apos;ll dig deeper once you sign up.
        </p>
      </div>
    </main>
  );
}
