import { useMemo } from 'react';
import { SCENARIOS, SCENARIO_LABEL, type ScenarioId } from '../../sim/config';
import { R_SH, type ScenarioResult } from '../../sim/simulate';
import { useStore } from '../../store';
import { Counters } from '../Counters';
import { MapCanvas } from '../map/MapCanvas';
import { COLORS } from '../map/renderer';
import { SCENARIO_COLOR } from '../theme';
import { Card, PageTitle, Segmented } from '../ui';
import { Timeline } from '../Timeline';

function StatusPill({ result }: { result: ScenarioResult }) {
  const { config } = useStore();
  const m = useStore((s) => Math.max(0, Math.min(s.config.horizonMin, Math.floor(s.t))));
  const d = Math.max(result.series.densityNorth[m], result.series.densitySouth[m]);
  const unsafe = d > config.u6.safeDensity;
  const dense = d > config.u6.safeDensity * 0.6;
  const [label, cls] = unsafe
    ? ['Unsafe', 'bg-brand-50 text-brand']
    : dense
      ? ['Dense', 'bg-amber-50 text-amber-700']
      : ['Safe', 'bg-emerald-50 text-emerald-700'];
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${unsafe ? 'animate-pulse bg-brand' : dense ? 'bg-amber-500' : 'bg-emerald-500'}`} />
      {label}
    </span>
  );
}

function NaiveTip({ side }: { side: ScenarioId }) {
  const rec = useStore((s) => (s.results ? s.results.naive.series.naiveRec[Math.max(0, Math.min(s.config.horizonMin, Math.floor(s.t)))] : -1));
  if (side !== 'naive' || rec < 0) return null;
  return <span className="rounded-full bg-fill px-2.5 py-1 text-xs font-medium text-ink-2">Tip: {rec === R_SH ? 'shuttle' : 'U6'}</span>;
}

function Panel({ side, which }: { side: ScenarioId; which: 'left' | 'right' }) {
  const { results, config, plan, set } = useStore();
  const blockIds = useMemo(() => plan?.blocks.map((b) => b.blockId) ?? [], [plan]);
  const awayIdx = useMemo(() => plan?.blocks.filter((b) => b.isAway).map((b) => b.index) ?? [], [plan]);
  const result = results?.[side];
  return (
    <Card className="flex min-w-0 flex-1 flex-col gap-4 p-5" data-pitch={`panel-${which}`}>
      <div className="flex items-center justify-between gap-3">
        <label className="group relative flex cursor-pointer items-center gap-2.5">
          <span className="h-3 w-3 rounded-full ring-4 ring-black/[0.03]" style={{ background: SCENARIO_COLOR[side] }} />
          <span className="text-[19px] font-semibold tracking-tight text-ink">{SCENARIO_LABEL[side]}</span>
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-ink-3 transition-colors group-hover:text-ink" fill="currentColor">
            <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <select
            value={side}
            onChange={(e) => set({ [which]: e.target.value } as never)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Scenario"
          >
            {SCENARIOS.map((s) => (
              <option key={s} value={s}>
                {SCENARIO_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <NaiveTip side={side} />
          {result && <StatusPill result={result} />}
        </div>
      </div>
      {result ? (
        <>
          <div className="overflow-hidden rounded-2xl ring-1 ring-black/[0.04]">
            <MapCanvas result={result} config={config} blockIds={blockIds} awayIdx={awayIdx} />
          </div>
          <Counters result={result} config={config} />
        </>
      ) : (
        <div className="grid aspect-[1000/620] w-full place-items-center rounded-2xl bg-canvas text-sm text-ink-3">Simulating…</div>
      )}
    </Card>
  );
}

const LEGEND = [
  [COLORS.seat, 'Seated'],
  [COLORS.green, 'Flowing'],
  [COLORS.amber, 'Dense'],
  [COLORS.red, 'Unsafe'],
];

export function SimulationTab() {
  const { left, right, simLayout, set } = useStore();
  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="After the final whistle"
        subtitle="75,024 fans. Same seed, two strategies."
        right={
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-3 text-xs text-ink-2">
              {LEGEND.map(([c, l]) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: c }} />
                  {l}
                </span>
              ))}
            </div>
            <Segmented
              size="sm"
              value={simLayout}
              onChange={(v) => set({ simLayout: v })}
              options={[
                { value: 'split', label: 'Compare' },
                { value: 'single', label: 'Single' },
              ]}
            />
          </div>
        }
      />
      <div className="flex gap-5">
        <Panel side={left} which="left" />
        {simLayout === 'split' && <Panel side={right} which="right" />}
      </div>
      <div className="sticky bottom-6 z-20 mr-16">
        <Timeline />
      </div>
    </div>
  );
}
