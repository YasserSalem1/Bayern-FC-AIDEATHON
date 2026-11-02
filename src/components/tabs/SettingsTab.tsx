import { useEffect, useState } from 'react';
import {
  DEFAULT_CONFIG,
  INCENTIVES,
  INCENTIVE_LABEL,
  SEGMENTS,
  SEGMENT_LABEL,
  type SimConfig,
  cloneConfig,
} from '../../sim/config';
import { useStore } from '../../store';
import { AssumptionBadge, Button, Card, CardHeader } from '../ui';

type Field = { path: string; label: string; unit?: string; step?: number; min?: number; max?: number; pct?: boolean };

const GROUPS: { title: string; subtitle?: string; fields: Field[] }[] = [
  {
    title: 'Crowd',
    fields: [
      { path: 'seed', label: 'Random seed', step: 1, min: 1 },
      { path: 'totalFans', label: 'Fans in the stadium', step: 1, min: 1000, max: 75024 },
      { path: 'appAdoption', label: 'Fans with the app', pct: true, step: 1, min: 0, max: 100 },
      { path: 'horizonMin', label: 'Simulated time after whistle', unit: 'min', step: 10, min: 120, max: 300 },
    ],
  },
  {
    title: 'Natural leaving curve',
    fields: [
      { path: 'leaving.baseMedianMin', label: 'Median leaving time', unit: 'min', step: 0.5, min: 1 },
      { path: 'leaving.sigma', label: 'Spread (log-normal σ)', step: 0.05, min: 0.1 },
      { path: 'leaving.winLingerFactor', label: 'Win: linger factor', unit: '×', step: 0.05, min: 0.5 },
      { path: 'leaving.lossHurryFactor', label: 'Loss: hurry factor', unit: '×', step: 0.05, min: 0.3 },
      { path: 'leaving.rainHurryFactor', label: 'Rain: hurry factor', unit: '×', step: 0.05, min: 0.3 },
      { path: 'leaving.coldHurryFactor', label: 'Cold: hurry factor', unit: '×', step: 0.05, min: 0.3 },
    ],
  },
  {
    title: 'U6 via Esplanade → Fröttmaning',
    fields: [
      { path: 'u6.walkMin', label: 'Walk time (free flow)', unit: 'min', step: 1, min: 5 },
      { path: 'u6.trainHeadwayMin', label: 'Train every', unit: 'min', step: 0.5, min: 1 },
      { path: 'u6.trainCapacity', label: 'Passengers per train', step: 10, min: 100 },
      { path: 'u6.platformCapacity', label: 'Station holding capacity', unit: 'people', step: 100, min: 500 },
      { path: 'u6.esplanadeAreaM2', label: 'Esplanade walking area', unit: 'm²', step: 5000, min: 5000 },
      { path: 'u6.walkwayAreaM2', label: 'Station approach area', unit: 'm²', step: 500, min: 1000 },
      { path: 'u6.awayWalkwayAreaM2', label: 'Away lane area', unit: 'm²', step: 500, min: 500 },
      { path: 'u6.safeDensity', label: 'Max safe density', unit: 'p/m²', step: 0.1, min: 0.5 },
      { path: 'u6.crowdedBoardingLoss', label: 'Boarding loss when overcrowded', pct: true, step: 1, min: 0, max: 50 },
      { path: 'u6.rideMin', label: 'Ride + onward time', unit: 'min', step: 1, min: 5 },
    ],
  },
  {
    title: 'Shuttle buses',
    subtitle: 'Today shuttles are often underused.',
    fields: [
      { path: 'shuttle.buses', label: 'Buses', step: 1, min: 0 },
      { path: 'shuttle.seatsPerBus', label: 'Seats per bus', step: 5, min: 10 },
      { path: 'shuttle.roundTripMin', label: 'Round trip', unit: 'min', step: 1, min: 5 },
      { path: 'shuttle.walkMin', label: 'Walk to bus park', unit: 'min', step: 1, min: 1 },
      { path: 'shuttle.rideMin', label: 'Ride + onward time', unit: 'min', step: 1, min: 5 },
    ],
  },
  {
    title: 'Car parks',
    fields: [
      { path: 'car.vehicles', label: 'Car-park capacity', unit: 'vehicles', step: 100, min: 100 },
      { path: 'car.clearMin', label: 'Time to clear when full', unit: 'min', step: 5, min: 30 },
      { path: 'car.peoplePerCar', label: 'People per car', step: 0.1, min: 1 },
      { path: 'car.driveMin', label: 'Drive home', unit: 'min', step: 1, min: 5 },
    ],
  },
  {
    title: '“Same tip for all” app',
    fields: [
      { path: 'naive.updateEveryMin', label: 'Recommendation update every', unit: 'min', step: 1, min: 1 },
      { path: 'naive.followRate', label: 'App users who follow the tip', pct: true, step: 1, min: 0, max: 100 },
    ],
  },
  {
    title: 'Optimizer',
    fields: [
      { path: 'optimizer.slotMin', label: 'Slot length', unit: 'min', step: 1, min: 1 },
      { path: 'optimizer.maxWaveMin', label: 'Latest wave', unit: 'min', step: 5, min: 10 },
      { path: 'optimizer.u6QueueTarget', label: 'Max planned U6 queue', unit: 'people', step: 100, min: 0 },
      { path: 'optimizer.shuttleQueueTarget', label: 'Max planned shuttle queue', unit: 'people', step: 50, min: 0 },
      { path: 'optimizer.capacityMargin', label: 'Safety margin on capacity', pct: true, step: 1, min: 0, max: 50 },
    ],
  },
  {
    title: 'Reward budget',
    fields: [
      { path: 'rewards.pointsPerMinuteWaited', label: 'Store points per minute', step: 1, min: 0 },
      { path: 'rewards.storePointsBudget', label: 'Store-points budget', step: 50000, min: 0 },
      { path: 'rewards.cafeSeats', label: 'Partner-café places', step: 100, min: 0 },
      { path: 'rewards.cafePointsPerFan', label: 'Café points per fan', step: 10, min: 0 },
      { path: 'rewards.lotteryEntriesMax', label: 'Lottery entries available', step: 500, min: 0 },
      { path: 'rewards.lotteryMinDelayMin', label: 'Lottery: min. wait', unit: 'min', step: 5, min: 0 },
      { path: 'rewards.minDelayForIncentiveMin', label: 'Any reward: min. wait', unit: 'min', step: 1, min: 0 },
    ],
  },
];

function get(obj: unknown, path: string): number {
  return path.split('.').reduce<any>((o, k) => o?.[k], obj) as number;
}
function setPath(obj: any, path: string, v: unknown) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = v;
}

export function SettingsTab() {
  const { config, apply, phase } = useStore();
  const [draft, setDraft] = useState<SimConfig>(() => cloneConfig(config));
  useEffect(() => setDraft(cloneConfig(config)), [config]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);
  const update = (fn: (c: SimConfig) => void) =>
    setDraft((d) => {
      const n = cloneConfig(d);
      fn(n);
      return n;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Settings & assumptions</h2>
          <p className="text-sm text-slate-500">Every value below is an assumption and can be changed. All three scenarios re-run on the same seed.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setDraft(cloneConfig(DEFAULT_CONFIG))}>Reset to defaults</Button>
          <Button variant="primary" disabled={!dirty || (phase !== 'ready' && phase !== 'error')} onClick={() => void apply(cloneConfig(draft))}>
            Apply & re-run
          </Button>
        </div>
      </div>
      <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        <b>Simulation with assumed parameters for demonstration purposes.</b> Venue geometry comes from OpenStreetMap; capacities, behaviour and acceptance rates
        are illustrative assumptions, not official figures.
      </div>

      <Card>
        <CardHeader title="Match context" subtitle="Shifts the natural leaving curve: fans linger after a win, hurry in rain or cold." right={<AssumptionBadge />} />
        <div className="grid grid-cols-3 gap-4 px-5 pb-5">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Result</span>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
              value={draft.match.result}
              onChange={(e) => update((c) => (c.match.result = e.target.value as SimConfig['match']['result']))}
            >
              <option value="win">Win</option>
              <option value="draw">Draw</option>
              <option value="loss">Loss</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Kick-off</span>
            <input
              type="time"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
              value={draft.match.kickoff}
              onChange={(e) => update((c) => (c.match.kickoff = e.target.value || '20:30'))}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Weather</span>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
              value={draft.match.weather}
              onChange={(e) => update((c) => (c.match.weather = e.target.value as SimConfig['match']['weather']))}
            >
              <option value="dry">Dry</option>
              <option value="rain">Rain</option>
              <option value="cold">Cold</option>
            </select>
          </label>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {GROUPS.map((g) => (
          <Card key={g.title}>
            <CardHeader title={g.title} subtitle={g.subtitle} />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pb-5">
              {g.fields.map((f) => {
                const raw = get(draft, f.path);
                const shown = f.pct ? Math.round(raw * 100) : raw;
                return (
                  <label key={f.path} className="text-sm">
                    <span className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
                      {f.label}
                      {f.path !== 'seed' && <AssumptionBadge />}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={shown}
                        step={f.step}
                        min={f.min}
                        max={f.max}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v)) return;
                          update((c) => setPath(c, f.path, f.pct ? v / 100 : v));
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 tabular-nums"
                      />
                      <span className="w-14 shrink-0 text-xs text-slate-400">{f.pct ? '%' : f.unit}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Fan segments" subtitle="Acceptance = probability that a fan who sees the advice follows it, per incentive offered." right={<AssumptionBadge />} />
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] tracking-wide text-slate-500 uppercase">
                <th className="py-2 font-medium">Segment</th>
                {INCENTIVES.map((i) => (
                  <th key={i} className="py-2 font-medium">
                    {INCENTIVE_LABEL[i]}
                  </th>
                ))}
                <th className="py-2 font-medium">Travel by car</th>
                <th className="py-2 font-medium">Coach / taxi / walk</th>
                <th className="py-2 font-medium">Wait aversion</th>
              </tr>
            </thead>
            <tbody>
              {SEGMENTS.filter((s) => s !== 'away').map((s) => (
                <tr key={s} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-medium text-slate-700">{SEGMENT_LABEL[s]}</td>
                  {INCENTIVES.map((i) => (
                    <td key={i} className="py-1.5 pr-3">
                      <PctInput value={draft.segments[s].acceptance[i]} onChange={(v) => update((c) => (c.segments[s].acceptance[i] = v))} />
                    </td>
                  ))}
                  <td className="py-1.5 pr-3">
                    <PctInput value={draft.segments[s].carShare} onChange={(v) => update((c) => (c.segments[s].carShare = v))} />
                  </td>
                  <td className="py-1.5 pr-3">
                    <PctInput value={draft.segments[s].otherShare} onChange={(v) => update((c) => (c.segments[s].otherShare = v))} />
                  </td>
                  <td className="py-1.5">
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      value={draft.segments[s].waitAversion}
                      onChange={(e) => update((c) => (c.segments[s].waitAversion = Number(e.target.value)))}
                      className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 tabular-nums"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">
            Away fans (blocks N3, N4 in the Nordkurve) always use the fixed Esplanade Süd lane and are never re-routed. Block segment mixes are defined in{' '}
            <code className="rounded bg-slate-100 px-1">src/sim/config.ts</code>.
          </p>
        </div>
      </Card>
    </div>
  );
}

function PctInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value))) / 100)}
        className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 tabular-nums"
      />
      <span className="text-xs text-slate-400">%</span>
    </span>
  );
}
