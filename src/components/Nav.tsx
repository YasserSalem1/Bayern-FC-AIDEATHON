import { useStore, type Tab } from '../store';

const TABS: { id: Tab; label: string; hint: string; icon: string }[] = [
  { id: 'simulation', label: 'Simulation', hint: 'Live crowd map', icon: 'M3 12h4l3-8 4 16 3-8h4' },
  { id: 'comparison', label: 'Comparison', hint: 'Charts & metrics', icon: 'M4 20V10M10 20V4M16 20v-6M22 20H2' },
  { id: 'decisions', label: 'AI Decisions', hint: 'Optimizer + Gemini', icon: 'M12 3v3m0 12v3m9-9h-3M6 12H3m14.5-6.5-2 2m-7 7-2 2m11 0-2-2m-7-7-2-2' },
  { id: 'fan', label: 'Fan App', hint: 'What the fan sees', icon: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 17h2' },
  { id: 'settings', label: 'Settings', hint: 'Assumptions', icon: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4' },
];

export function Nav() {
  const { tab, set } = useStore();
  return (
    <nav className="flex w-52 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-3" data-pitch="nav">
      {TABS.map((t) => (
        <button
          type="button"
          key={t.id}
          onClick={() => set({ tab: t.id })}
          className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
            tab === t.id ? 'bg-brand-50 text-brand' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d={t.icon} />
          </svg>
          <span>
            <span className="block text-sm font-semibold">{t.label}</span>
            <span className={`block text-[11px] ${tab === t.id ? 'text-brand/70' : 'text-slate-400'}`}>{t.hint}</span>
          </span>
        </button>
      ))}
      <div className="mt-auto rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
        Simulation with assumed parameters for demonstration purposes.
      </div>
    </nav>
  );
}
