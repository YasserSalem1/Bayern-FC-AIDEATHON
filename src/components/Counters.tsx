import type { SimConfig } from '../sim/config';
import type { ScenarioResult } from '../sim/simulate';
import { useStore } from '../store';
import { fmt } from './theme';
import { Stat } from './ui';

export function Counters({ result, config }: { result: ScenarioResult; config: SimConfig }) {
  const m = useStore((s) => Math.max(0, Math.min(config.horizonMin, Math.floor(s.t))));
  const s = result.series;
  const density = Math.max(s.densityNorth[m], s.densitySouth[m]);
  const unsafe = density > config.u6.safeDensity;
  return (
    <div className="grid grid-cols-5 gap-4 px-1">
      <Stat label="In stadium" value={fmt(s.inStadium[m])} />
      <Stat label="U6 queue" value={fmt(s.u6Queue[m])} tone={s.u6Queue[m] > config.u6.platformCapacity ? 'bad' : 'neutral'} />
      <Stat label="Wait" value={`${fmt(s.u6ExpectedWait[m])} min`} />
      <Stat label="Density" value={density.toFixed(1)} sub={unsafe ? 'unsafe' : 'p/m²'} tone={unsafe ? 'bad' : 'neutral'} />
      <Stat label="Home" value={`${fmt((s.home[m] / config.totalFans) * 100)}%`} tone="good" />
    </div>
  );
}
