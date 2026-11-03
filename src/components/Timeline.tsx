import { formatClock, whistleClockMin } from '../sim/config';
import { useStore } from '../store';
import { Segmented } from './ui';

export function Timeline() {
  const t = useStore((s) => Math.round(s.t * 4) / 4);
  const { playing, speed, config, set, setT, results } = useStore();
  const whistle = whistleClockMin(config);
  const H = config.horizonMin;
  return (
    <div
      className="flex items-center gap-5 rounded-full bg-white/80 py-2.5 pr-5 pl-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_28px_rgba(0,0,0,0.06)] backdrop-blur-xl"
      data-pitch="timeline"
    >
      <button
        type="button"
        disabled={!results}
        onClick={() => {
          if (t >= H) setT(0);
          set({ playing: !playing });
        }}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-30"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
        )}
      </button>
      <div className="w-24 shrink-0 leading-tight">
        <div className="text-lg font-semibold tabular-nums">{formatClock(whistle + t)}</div>
        <div className="text-[11px] text-ink-3 tabular-nums">+{Math.floor(t)} min</div>
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
        className="h-1 flex-1 cursor-pointer outline-none"
        aria-label="Timeline"
      />
      <Segmented size="sm" value={speed} onChange={(v) => set({ speed: v })} options={[1, 5, 20].map((v) => ({ value: v, label: `${v}×` }))} />
    </div>
  );
}
