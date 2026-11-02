import { useMemo } from 'react';
import { SCENARIOS, SCENARIO_LABEL, type ScenarioId } from '../../sim/config';
import { R_SH } from '../../sim/simulate';
import { useStore } from '../../store';
import { Counters } from '../Counters';
import { MapCanvas } from '../map/MapCanvas';
import { COLORS } from '../map/renderer';
import { SCENARIO_COLOR } from '../theme';
import { Card, Segmented } from '../ui';
import { Timeline } from '../Timeline';

function NaiveTip({ side }: { side: ScenarioId }) {
  const rec = useStore((s) => (s.results ? s.results.naive.series.naiveRec[Math.min(s.config.horizonMin, Math.floor(s.t))] : -1));
  if (side !== 'naive' || rec < 0) return null;
  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
      App tells everyone: “{rec === R_SH ? 'Take the shuttle – fastest now' : 'Take the U6 – fastest now'}”
    </span>
  );
}

function Panel({ side, which }: { side: ScenarioId; which: 'left' | 'right' }) {
  const { results, config, plan, set } = useStore();
  const blockIds = useMemo(() => plan?.blocks.map((b) => b.blockId) ?? [], [plan]);
  const awayIdx = useMemo(() => plan?.blocks.filter((b) => b.isAway).map((b) => b.index) ?? [], [plan]);
  const result = results?.[side];
  return (
    <Card className="flex min-w-0 flex-1 flex-col gap-3 p-4" data-pitch={`panel-${which}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SCENARIO_COLOR[side] }} />
          <Segmented
            size="sm"
            value={side}
            onChange={(v) => set({ [which]: v } as never)}
            options={SCENARIOS.map((s) => ({ value: s, label: SCENARIO_LABEL[s] }))}
          />
        </div>
        <NaiveTip side={side} />
      </div>
      {result ? (
        <>
          <MapCanvas result={result} config={config} blockIds={blockIds} awayIdx={awayIdx} />
          <Counters result={result} config={config} />
        </>
      ) : (
        <div className="grid aspect-[1000/620] w-full place-items-center rounded-xl bg-slate-50 text-sm text-slate-400">Running simulation…</div>
      )}
    </Card>
  );
}

export function SimulationTab() {
  const { left, right, simLayout, set } = useStore();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">After the final whistle</h2>
          <p className="text-sm text-slate-500">75,024 fans, same random seed in both views. Each dot ≈ 10 fans. Map: OpenStreetMap geometry, drawn to scale.</p>
        </div>
        <div className="flex items-center gap-4">
          <Legend />
          <Segmented
            size="sm"
            value={simLayout}
            onChange={(v) => set({ simLayout: v })}
            options={[
              { value: 'split', label: 'Side by side' },
              { value: 'single', label: 'Single map' },
            ]}
          />
        </div>
      </div>
      <div className="flex gap-4">
        <Panel side={left} which="left" />
        {simLayout === 'split' && <Panel side={right} which="right" />}
      </div>
      <Timeline />
    </div>
  );
}

function Legend() {
  const items = [
    [COLORS.seat, 'In seat'],
    [COLORS.green, 'Flowing'],
    [COLORS.amber, 'Dense'],
    [COLORS.red, 'Above safe density / overloaded'],
  ];
  return (
    <div className="flex items-center gap-4 text-xs text-slate-500">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  );
}
