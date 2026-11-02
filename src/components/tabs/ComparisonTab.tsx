import { useMemo, type ReactNode } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SCENARIOS, SCENARIO_LABEL, type ScenarioId, formatClock, whistleClockMin } from '../../sim/config';
import type { ScenarioResult, Series, Summary } from '../../sim/simulate';
import { useStore } from '../../store';
import { SCENARIO_COLOR, fmt, pctChange } from '../theme';
import { Card, CardHeader } from '../ui';

type Row = Record<string, number>;

function buildRows(results: Record<ScenarioId, ScenarioResult>, pick: (s: Series, m: number) => number, every = 1): Row[] {
  const n = results.none.series.home.length;
  const rows: Row[] = [];
  for (let m = 0; m < n; m += every) {
    const r: Row = { m };
    for (const id of SCENARIOS) r[id] = Math.round(pick(results[id].series, m) * 100) / 100;
    rows.push(r);
  }
  return rows;
}

function TimeChart({
  rows,
  unit,
  threshold,
  thresholdLabel,
  digits = 0,
}: {
  rows: Row[];
  unit: string;
  threshold?: number;
  thresholdLabel?: string;
  digits?: number;
}) {
  const config = useStore((s) => s.config);
  const t = useStore((s) => Math.floor(s.t));
  const whistle = whistleClockMin(config);
  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#EEF2F6" vertical={false} />
        <XAxis
          dataKey="m"
          type="number"
          domain={[0, config.horizonMin]}
          ticks={Array.from({ length: Math.floor(config.horizonMin / 30) + 1 }, (_, i) => i * 30)}
          tickFormatter={(m: number) => `+${m}`}
          tick={{ fontSize: 11, fill: '#64748B' }}
          axisLine={{ stroke: '#CBD5E1' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#64748B' }}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <Tooltip
          formatter={(v, name) => [`${fmt(Number(v), digits)} ${unit}`, SCENARIO_LABEL[name as ScenarioId]]}
          labelFormatter={(m) => `${formatClock(whistle + Number(m))} (+${m} min)`}
          contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }}
        />
        <Legend formatter={(v: string) => <span className="text-xs text-slate-600">{SCENARIO_LABEL[v as ScenarioId]}</span>} iconType="plainline" />
        {threshold !== undefined && (
          <ReferenceLine
            y={threshold}
            stroke="#0F172A"
            strokeDasharray="4 4"
            label={{ value: thresholdLabel, position: 'insideTopRight', fontSize: 11, fill: '#0F172A' }}
          />
        )}
        <ReferenceLine x={t} stroke="#94A3B8" strokeWidth={1} />
        {SCENARIOS.map((id) => (
          <Line key={id} dataKey={id} stroke={SCENARIO_COLOR[id]} strokeWidth={id === 'ai' ? 2.5 : 2} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function Headline({ label, value, from, to, note }: { label: string; value: string; from: string; to: string; note?: string }) {
  return (
    <Card className="p-5">
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="mt-1 text-3xl font-extrabold tracking-tight text-brand tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-slate-500 tabular-nums">
        {from} → <span className="font-semibold text-slate-800">{to}</span>
      </div>
      {note && <div className="mt-1 text-[11px] text-slate-400">{note}</div>}
    </Card>
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
  if (!results || !rows) return <div className="text-sm text-slate-400">Running simulation…</div>;
  const a = results.none.summary;
  const b = results.ai.summary;
  const naive = results.naive.summary;
  const naiveShuttle = naive.routeStats.shuttle;
  const naiveU6 = naive.routeStats.u6North;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">AI load balancer vs. no coordination</h2>
        <p className="text-sm text-slate-500">Same fans, same seed, same match context. Headline numbers compare “AI load balancer” with “No coordination”.</p>
      </div>
      <div className="grid grid-cols-5 gap-4" data-pitch="headlines">
        <Headline label="Peak platform queue" value={signed(pctChange(a.peakU6Queue, b.peakU6Queue))} from={fmt(a.peakU6Queue)} to={fmt(b.peakU6Queue)} />
        <Headline
          label="Peak walkway density"
          value={signed(pctChange(a.peakDensity, b.peakDensity))}
          from={`${a.peakDensity.toFixed(2)} p/m²`}
          to={`${b.peakDensity.toFixed(2)} p/m²`}
        />
        <Headline
          label="Minutes above safe density"
          value={signed(b.minutesAboveSafe - a.minutesAboveSafe, ' min')}
          from={`${a.minutesAboveSafe} min`}
          to={`${b.minutesAboveSafe} min`}
        />
        <Headline label="Average wait in queues" value={signed(pctChange(a.avgWait, b.avgWait))} from={`${fmt(a.avgWait, 1)} min`} to={`${fmt(b.avgWait, 1)} min`} />
        <Headline
          label="Avg time to home"
          value={signed(b.avgTimeToHome - a.avgTimeToHome, ' min')}
          from={`${fmt(a.avgTimeToHome)} min`}
          to={`${fmt(b.avgTimeToHome)} min`}
          note={`AI fans spend ${fmt(b.avgStayInStadium - a.avgStayInStadium)} min more in the stadium instead`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card data-pitch="chart-queue">
          <CardHeader title="U6 platform queue over time" subtitle="People waiting for a train at Fröttmaning, incl. those held back on the Esplanade" />
          <div className="px-2 pb-3">
            <TimeChart rows={rows.queue} unit="people" threshold={config.u6.platformCapacity} thresholdLabel="station capacity" />
          </div>
        </Card>
        <Card data-pitch="chart-density">
          <CardHeader title="Walkway density over time" subtitle="Station approach (bridge & stairs into Fröttmaning), persons per m²" />
          <div className="px-2 pb-3">
            <TimeChart rows={rows.density} unit="p/m²" digits={2} threshold={config.u6.safeDensity} thresholdLabel={`safe limit ${config.u6.safeDensity} p/m²`} />
          </div>
        </Card>
        <Card data-pitch="chart-shuttle">
          <CardHeader
            title="Shuttle queue over time – the herding effect"
            subtitle="The naive app sends everyone to the route that looks fastest, which overloads it"
          />
          <div className="px-2 pb-3">
            <TimeChart rows={rows.shuttle} unit="people" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Fans home over time" subtitle="Share of all 75,024 fans who have arrived home" />
          <div className="px-2 pb-3">
            <TimeChart rows={rows.home} unit="%" digits={1} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardHeader title="All metrics" subtitle="Bars are scaled per row; lower is better" />
          <MetricsTable results={results} />
        </Card>
        <Card className="p-5" data-pitch="naive-callout">
          <div className="text-xs font-semibold tracking-wide text-amber-700 uppercase">Why coordination matters</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            At the whistle the naive app sees an empty bus stop and tells every app user <b>“take the shuttle”</b>.{' '}
            <b className="tabular-nums">{fmt(naiveShuttle.users)}</b> fans follow – the shuttle becomes the <b>slowest</b> route:
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-amber-50 p-3">
              <div className="text-[11px] text-amber-800">Shuttle (recommended)</div>
              <div className="text-lg font-bold text-amber-900 tabular-nums">{fmt(naiveShuttle.avgTimeToHome)} min</div>
              <div className="text-[11px] text-amber-800">avg time to home</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-[11px] text-slate-600">U6 (not recommended)</div>
              <div className="text-lg font-bold text-slate-900 tabular-nums">{fmt(naiveU6.avgTimeToHome)} min</div>
              <div className="text-[11px] text-slate-600">avg time to home</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Worst wait with the naive app: <b className="tabular-nums">{fmt(naive.worstWait)} min</b>; {fmt(naive.notHome)} fans still not home after{' '}
            {config.horizonMin / 60} h.
          </p>
        </Card>
      </div>
    </div>
  );
}

const METRICS: { label: string; get: (s: Summary) => number; unit: string; digits?: number }[] = [
  { label: 'Peak U6 queue', get: (s) => s.peakU6Queue, unit: '' },
  { label: 'Peak shuttle queue', get: (s) => s.peakShuttleQueue, unit: '' },
  { label: 'Peak walkway density', get: (s) => s.peakDensity, unit: ' p/m²', digits: 2 },
  { label: 'Minutes above safe density', get: (s) => s.minutesAboveSafe, unit: ' min' },
  { label: 'Average wait in queues', get: (s) => s.avgWait, unit: ' min', digits: 1 },
  { label: 'Worst wait (95th percentile)', get: (s) => s.p95Wait, unit: ' min' },
  { label: 'Worst wait (max)', get: (s) => s.worstWait, unit: ' min' },
  { label: 'Average time to home', get: (s) => s.avgTimeToHome, unit: ' min', digits: 1 },
];

function MetricsTable({ results }: { results: Record<ScenarioId, ScenarioResult> }) {
  return (
    <div className="overflow-x-auto px-5 pb-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] tracking-wide text-slate-500 uppercase">
            <th className="py-2 font-medium">Metric</th>
            {SCENARIOS.map((id) => (
              <th key={id} className="py-2 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: SCENARIO_COLOR[id] }} />
                  {SCENARIO_LABEL[id]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => {
            const vals = SCENARIOS.map((id) => m.get(results[id].summary));
            const max = Math.max(...vals, 1e-9);
            return (
              <tr key={m.label} className="border-t border-slate-100">
                <td className="py-2 pr-3 text-slate-600">{m.label}</td>
                {SCENARIOS.map((id, i) => (
                  <Cell key={id} pct={(vals[i] / max) * 100} color={SCENARIO_COLOR[id]}>
                    {fmt(vals[i], m.digits ?? 0)}
                    {m.unit}
                  </Cell>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ pct, color, children }: { pct: number; color: string; children: ReactNode }) {
  return (
    <td className="py-2 pr-4">
      <div className="flex items-center gap-2">
        <div className="h-2 w-24 rounded-full bg-slate-100">
          <div className="h-2 rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
        </div>
        <span className="text-slate-800 tabular-nums">{children}</span>
      </div>
    </td>
  );
}
