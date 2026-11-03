import { useMemo } from 'react';
import { SCENARIOS, SCENARIO_LABEL, type ScenarioId } from '../../sim/config';
import { R_SH } from '../../sim/simulate';
import { useStore } from '../../store';
import { Counters } from '../Counters';
import { MapCanvas } from '../map/MapCanvas';
import { COLORS } from '../map/renderer';
import { SCENARIO_COLOR } from '../theme';
import { Card, PageTitle, Segmented } from '../ui';
import { Timeline } from '../Timeline';

function NaiveTip({ side }: { side: ScenarioId }) {
  const rec = useStore((s) => (s.results ? s.results.naive.series.naiveRec[Math.max(0, Math.min(s.config.horizonMin, Math.floor(s.t)))] : -1));
  if (side !== 'naive' || rec < 0) return null;
  return <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">Tip: {rec === R_SH ? 'shuttle' : 'U6'}</span>;
}

function Panel({ side, which }: { side: ScenarioId; which: 'left' | 'right' }) {
  const { results, config, plan, set } = useStore();
  const blockIds = useMemo(() => plan?.blocks.map((b) => b.blockId) ?? [], [plan]);
  const awayIdx = useMemo(() => plan?.blocks.filter((b) => b.isAway).map((b) => b.index) ?? [], [plan]);
  const result = results?.[side];
  return (
    <Card className="flex min-w-0 flex-1 flex-col gap-4 p-4" data-pitch={`panel-${which}`}>
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: SCENARIO_COLOR[side] }} />
          <Segmented size="sm" value={side} onChange={(v) => set({ [which]: v } as never)} options={SCENARIOS.map((s) => ({ value: s, label: SCENARIO_LABEL[s] }))} />
        </div>
        <NaiveTip side={side} />
      </div>
      {result ? (
        <>
          <MapCanvas result={result} config={config} blockIds={blockIds} awayIdx={awayIdx} />
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
