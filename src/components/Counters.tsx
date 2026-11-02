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
    <div className="grid grid-cols-6 gap-3 px-1">
      <Stat label="In stadium" value={fmt(s.inStadium[m])} />
      <Stat
        label="On Esplanade"
        value={fmt(s.walkwayNorth[m] + s.walkwaySouth[m])}
        sub={<span className={unsafe ? 'font-semibold text-brand' : ''}>{density.toFixed(2)} p/m²{unsafe ? ' · unsafe' : ''}</span>}
      />
      <Stat label="U6 queue" value={fmt(s.u6Queue[m])} tone={s.u6Queue[m] > config.u6.platformCapacity ? 'bad' : 'neutral'} sub={`≈ ${fmt(s.u6ExpectedWait[m])} min wait`} />
      <Stat label="Shuttle queue" value={fmt(s.shuttleQueue[m])} tone={s.shuttleExpectedWait[m] > 25 ? 'bad' : 'neutral'} sub={`≈ ${fmt(s.shuttleExpectedWait[m])} min wait`} />
      <Stat label="Car-park queue" value={fmt(s.carQueue[m])} />
      <Stat label="Home" value={fmt(s.home[m])} sub={`${fmt((s.home[m] / config.totalFans) * 100)}%`} tone="good" />
    </div>
  );
}
