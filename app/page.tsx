import { HeroAndForm } from "./components/HeroAndForm";

export default function Home(): React.ReactElement {
  return (
    <>
      <header className="px-8 py-5 flex justify-between items-center border-b border-[color:var(--rule)] sticky top-0 z-50 backdrop-blur-md bg-[rgba(250,245,237,0.85)]">
        <div className="font-display font-semibold text-[22px] tracking-[-0.02em]">
          Findable<span className="text-[color:var(--orange)]">.</span>
        </div>
        <div className="hidden md:flex gap-6 items-center text-sm text-[color:var(--ink-soft)]">
          <span className="bg-[color:var(--cream-deep)] border border-[color:var(--rule)] px-3 py-[6px] rounded-full text-[12px] text-[color:var(--muted)] tracking-[0.04em] uppercase">
            Stage 2 prototype
          </span>
        </div>
      </header>
      <HeroAndForm />
      <footer className="px-8 py-10 mt-12 border-t border-[color:var(--rule)] text-[12px] text-[color:var(--muted)] text-center">
        Built by Findable. Estimates only — full picture comes from a real audit.
      </footer>
    </>
  );
}
