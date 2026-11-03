import { useStore, type Tab } from '../store';
import { Segmented, Spinner } from './ui';

const TABS: { id: Tab; label: string }[] = [
  { id: 'simulation', label: 'Simulation' },
  { id: 'comparison', label: 'Results' },
  { id: 'decisions', label: 'AI Decisions' },
  { id: 'settings', label: 'Settings' },
];

export function Header() {
  const { phase, apiLive, lastGeminiSource, model, set, tab } = useStore();
  const live = apiLive && lastGeminiSource === 'live';
  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto grid max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-8 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-[9px] bg-brand text-[11px] font-bold text-white">3H</div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">The Third Half</div>
            <div className="text-[11px] text-ink-3">Mia san mia. Nur ned alle auf oamal.</div>
          </div>
        </div>
        <nav data-pitch="nav">
          <Segmented value={tab} onChange={(v) => set({ tab: v })} options={TABS.map((t) => ({ value: t.id, label: t.label }))} />
        </nav>
        <div className="flex items-center justify-end gap-3">
          {phase !== 'ready' && phase !== 'error' && <Spinner />}
          <span
            title={live ? `Live · ${model}` : 'Offline: cached responses'}
            className="flex items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-xs font-medium text-ink-2"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-ink-3'}`} />
            Gemini: {live ? 'Live' : 'Cached'}
          </span>
        </div>
      </div>
    </header>
  );
}
