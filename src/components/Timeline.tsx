import { formatClock, whistleClockMin } from '../sim/config';
import { useStore } from '../store';
import { Segmented } from './ui';

export function Timeline() {
  const t = useStore((s) => Math.round(s.t * 4) / 4);
  const { playing, speed, config, set, setT, results } = useStore();
  const whistle = whistleClockMin(config);
  const H = config.horizonMin;
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm" data-pitch="timeline">
      <button
        type="button"
        disabled={!results}
        onClick={() => {
          if (t >= H) setT(0);
          set({ playing: !playing });
        }}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-40"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
        )}
      </button>
      <div className="w-28 shrink-0">
        <div className="text-xl font-bold text-slate-900 tabular-nums">{formatClock(whistle + t)}</div>
        <div className="text-[11px] text-slate-500 tabular-nums">+{Math.floor(t)} min after whistle</div>
      </div>
      <input
        type="range"
        min={0}
        max={H}
        step={0.5}
        value={t}
        onChange={(e) => {
          set({ playing: false });
          setT(Number(e.target.value));
        }}
        className="h-1.5 flex-1 cursor-pointer"
        aria-label="Timeline"
      />
      <Segmented
        size="sm"
        value={speed}
        onChange={(v) => set({ speed: v })}
        options={[1, 5, 20].map((v) => ({ value: v, label: `${v}×` }))}
      />
    </div>
  );
}
