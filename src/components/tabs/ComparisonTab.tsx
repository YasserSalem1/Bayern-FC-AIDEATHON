import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SCENARIOS, SCENARIO_LABEL, type ScenarioId, formatClock, whistleClockMin } from '../../sim/config';
import type { ScenarioResult, Series, Summary } from '../../sim/simulate';
import { useStore } from '../../store';
import { SCENARIO_COLOR, fmt, pctChange } from '../theme';
import { Card, CardHeader, PageTitle } from '../ui';

type Row = Record<string, number>;

function buildRows(results: Record<ScenarioId, ScenarioResult>, pick: (s: Series, m: number) => number): Row[] {
  const n = results.none.series.home.length;
  const rows: Row[] = [];
  for (let m = 0; m < n; m++) {
    const r: Row = { m };
    for (const id of SCENARIOS) r[id] = Math.round(pick(results[id].series, m) * 100) / 100;
    rows.push(r);
  }
  return rows;
}

const AXIS = { fontSize: 11, fill: '#86868B' };

function TimeChart({ rows, unit, threshold, thresholdLabel, digits = 0 }: { rows: Row[]; unit: string; threshold?: number; thresholdLabel?: string; digits?: number }) {
  const config = useStore((s) => s.config);
  const t = useStore((s) => Math.floor(s.t));
  const whistle = whistleClockMin(config);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#F0F0F2" vertical={false} />
        <XAxis
          dataKey="m"
          type="number"
          domain={[0, config.horizonMin]}
          ticks={Array.from({ length: Math.floor(config.horizonMin / 30) + 1 }, (_, i) => i * 30)}
          tickFormatter={(m: number) => `+${m}`}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
        <Tooltip
          formatter={(v, name) => [`${fmt(Number(v), digits)} ${unit}`, SCENARIO_LABEL[name as ScenarioId]]}
          labelFormatter={(m) => `${formatClock(whistle + Number(m))} · +${m} min`}
          contentStyle={{ borderRadius: 14, border: 'none', boxShadow: '0 8px 28px rgba(0,0,0,0.12)', fontSize: 12 }}
        />
        {threshold !== undefined && (
          <ReferenceLine y={threshold} stroke="#1D1D1F" strokeDasharray="3 4" label={{ value: thresholdLabel, position: 'insideTopRight', fontSize: 11, fill: '#6E6E73' }} />
        )}
        <ReferenceLine x={t} stroke="#D2D2D7" />
        {SCENARIOS.map((id) => (
          <Line key={id} dataKey={id} stroke={SCENARIO_COLOR[id]} strokeWidth={id === 'ai' ? 2.5 : 2} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function Headline({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="p-6">
      <div className="text-[40px] leading-none font-semibold tracking-[-0.03em] text-brand tabular-nums">{value}</div>
      <div className="mt-3 text-[13px] font-medium text-ink">{label}</div>
      <div className="mt-0.5 text-xs text-ink-3 tabular-nums">{detail}</div>
    </Card>
  );
}

function ChartLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-ink-2">
      {SCENARIOS.map((id) => (
        <span key={id} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: SCENARIO_COLOR[id] }} />
          {SCENARIO_LABEL[id]}
        </span>
      ))}
    </div>
  );
}

const signed = (v: number, unit = '%') => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}${unit}`;

export function ComparisonTab() {
  const { results, config } = useStore();
  const rows = useMemo(() => {
    if (!results) return null;
    return {
      queue: buildRows(results, (s, m) => s.u6Queue[m]),
      shuttle: buildRows(results, (s, m) => s.shuttleQueue[m]),
      density: buildRows(results, (s, m) => Math.max(s.densityNorth[m], s.densitySouth[m])),
      home: buildRows(results, (s, m) => (s.home[m] / config.totalFans) * 100),
    };
  }, [results, config.totalFans]);
  if (!results || !rows) return <div className="text-sm text-ink-3">Simulating…</div>;
  const a = results.none.summary;
  const b = results.ai.summary;
  const naive = results.naive.summary;
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Results" subtitle={`${SCENARIO_LABEL.ai} vs. ${SCENARIO_LABEL.none.toLowerCase()}.`} right={<ChartLegend />} />
      <div className="grid grid-cols-4 gap-5" data-pitch="headlines">
        <Headline label="Peak platform queue" value={signed(pctChange(a.peakU6Queue, b.peakU6Queue))} detail={`${fmt(a.peakU6Queue)} → ${fmt(b.peakU6Queue)}`} />
        <Headline label="Minutes above safe density" value={`${b.minutesAboveSafe}`} detail={`was ${a.minutesAboveSafe} min`} />
        <Headline label="Average wait" value={signed(pctChange(a.avgWait, b.avgWait))} detail={`${fmt(a.avgWait)} → ${fmt(b.avgWait)} min`} />
        <Headline label="Time to home" value={signed(b.avgTimeToHome - a.avgTimeToHome, ' min')} detail={`${fmt(a.avgTimeToHome)} → ${fmt(b.avgTimeToHome)} min`} />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card data-pitch="chart-queue">
          <CardHeader title="U6 queue" />
          <div className="px-3 pb-4">
            <TimeChart rows={rows.queue} unit="people" threshold={config.u6.platformCapacity} thresholdLabel="station capacity" />
          </div>
        </Card>
        <Card data-pitch="chart-density">
          <CardHeader title="Station approach density" />
          <div className="px-3 pb-4">
            <TimeChart rows={rows.density} unit="p/m²" digits={2} threshold={config.u6.safeDensity} thresholdLabel={`safe ${config.u6.safeDensity} p/m²`} />
          </div>
        </Card>
        <Card data-pitch="chart-shuttle">
          <CardHeader
            title="Shuttle queue"
            subtitle={`Same tip for all: ${fmt(naive.routeStats.shuttle.users)} fans herd to the bus — worst wait ${fmt(naive.worstWait)} min.`}
          />
          <div className="px-3 pb-4">
            <TimeChart rows={rows.shuttle} unit="people" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Fans home" />
          <div className="px-3 pb-4">
            <TimeChart rows={rows.home} unit="%" digits={1} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="All metrics" />
        <MetricsTable results={results} />
      </Card>
    </div>
  );
}

const METRICS: { label: string; get: (s: Summary) => number; unit: string; digits?: number }[] = [
  { label: 'Peak U6 queue', get: (s) => s.peakU6Queue, unit: '' },
  { label: 'Peak shuttle queue', get: (s) => s.peakShuttleQueue, unit: '' },
  { label: 'Peak density', get: (s) => s.peakDensity, unit: ' p/m²', digits: 2 },
  { label: 'Minutes above safe density', get: (s) => s.minutesAboveSafe, unit: ' min' },
  { label: 'Average wait', get: (s) => s.avgWait, unit: ' min', digits: 1 },
  { label: 'Worst wait', get: (s) => s.worstWait, unit: ' min' },
  { label: 'Average time to home', get: (s) => s.avgTimeToHome, unit: ' min', digits: 1 },
];

function MetricsTable({ results }: { results: Record<ScenarioId, ScenarioResult> }) {
  return (
    <div className="overflow-x-auto px-6 pb-5">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-xs text-ink-3">
            <th className="py-2 font-normal" />
            {SCENARIOS.map((id) => (
              <th key={id} className="py-2 font-medium text-ink-2">
                {SCENARIO_LABEL[id]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => {
            const vals = SCENARIOS.map((id) => m.get(results[id].summary));
            const max = Math.max(...vals, 1e-9);
            return (
              <tr key={m.label} className="border-t border-black/5">
                <td className="py-2.5 pr-3 text-ink-2">{m.label}</td>
                {SCENARIOS.map((id, i) => (
                  <td key={id} className="py-2.5 pr-4">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 rounded-full bg-canvas">
                        <div className="h-1.5 rounded-full" style={{ width: `${Math.max(3, (vals[i] / max) * 100)}%`, background: SCENARIO_COLOR[id] }} />
                      </div>
                      <span className="tabular-nums">
                        {fmt(vals[i], m.digits ?? 0)}
                        {m.unit}
                      </span>
                    </div>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
