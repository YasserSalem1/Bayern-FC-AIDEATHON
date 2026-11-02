import { SEGMENTS, type SegmentId, type SimConfig } from './config';
import { mulberry32, normal, normCdf } from './rng';

export const MODE_PT = 0;
export const MODE_CAR = 1;
export const MODE_OTHER = 2;

export interface BlockInfo {
  id: string;
  index: number;
  size: number;
  isAway: boolean;
  mix: Record<SegmentId, number>;
  counts: Record<SegmentId, number>;
  carUsers: number;
  /** Fans leaving by coach, taxi, bike or on foot. */
  otherUsers: number;
  /** Public-transport users (U6 or shuttle) – the fans the optimizer can steer. */
  ptUsers: number;
  /** Average minutes from seat to the stadium gate. */
  egressMin: number;
}

/** Struct-of-arrays population so 75k fans fit in a few typed arrays. */
export interface Population {
  n: number;
  block: Uint8Array;
  segment: Uint8Array; // index into SEGMENTS
  /** Travel mode: MODE_PT, MODE_CAR or MODE_OTHER. */
  mode: Uint8Array;
  natShuttle: Uint8Array;
  /** Standard-normal draw that fixes this fan's place on the natural leaving curve. */
  z: Float32Array;
  /** Uniform draw deciding whether this fan follows advice (shared by all scenarios). */
  uComply: Float32Array;
  /** Uniform draw for where inside an exit wave this fan leaves. */
  uWave: Float32Array;
  /** Uniform draw for distance home. */
  uHome: Float32Array;
  egress: Float32Array;
  blocks: BlockInfo[];
}

/** Split `total` across weights so the parts are integers that sum exactly to `total`. */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0; k++, rest--) out[order[k % order.length][1]]++;
  return out;
}

export function buildPopulation(c: SimConfig): Population {
  const rand = mulberry32(c.seed);
  const n = c.totalFans;
  const sizes = apportion(n, c.blocks.map((b) => b.weight));
  const pop: Population = {
    n,
    block: new Uint8Array(n),
    segment: new Uint8Array(n),
    mode: new Uint8Array(n),
    natShuttle: new Uint8Array(n),
    z: new Float32Array(n),
    uComply: new Float32Array(n),
    uWave: new Float32Array(n),
    uHome: new Float32Array(n),
    egress: new Float32Array(n),
    blocks: [],
  };

  let i = 0;
  c.blocks.forEach((def, b) => {
    const size = sizes[b];
    const segWeights = SEGMENTS.map((s) => def.mix[s] ?? 0);
    const segCounts = apportion(size, segWeights.some((w) => w > 0) ? segWeights : [1, 0, 0, 0, 0]);
    const counts = {} as Record<SegmentId, number>;
    const mix = {} as Record<SegmentId, number>;
    SEGMENTS.forEach((s, k) => {
      counts[s] = segCounts[k];
      mix[s] = size > 0 ? segCounts[k] / size : 0;
    });
    // Upper blocks / far side take a little longer to reach a gate.
    const egressBase = 2.5 + ((b * 5) % 7) * 0.3;
    let carUsers = 0;
    let otherUsers = 0;
    SEGMENTS.forEach((s, k) => {
      const p = c.segments[s];
      for (let j = 0; j < segCounts[k]; j++, i++) {
        pop.block[i] = b;
        pop.segment[i] = k;
        const u = rand();
        const mode = u < p.carShare ? MODE_CAR : u < p.carShare + p.otherShare ? MODE_OTHER : MODE_PT;
        pop.mode[i] = mode;
        if (mode === MODE_CAR) carUsers++;
        if (mode === MODE_OTHER) otherUsers++;
        pop.natShuttle[i] = mode === MODE_PT && rand() < p.naturalShuttleShare ? 1 : 0;
        pop.z[i] = normal(rand);
        pop.uComply[i] = rand();
        pop.uWave[i] = rand();
        pop.uHome[i] = rand();
        pop.egress[i] = egressBase + rand() * 2;
      }
    });
    pop.blocks.push({
      id: def.id,
      index: b,
      size,
      isAway: !!def.isAway,
      mix,
      counts,
      carUsers,
      otherUsers,
      ptUsers: size - carUsers - otherUsers,
      egressMin: egressBase + 1,
    });
  });
  return pop;
}

/** Median minute after the whistle at which fans leave, given the match context. */
export function leavingMedian(c: SimConfig): number {
  const l = c.leaving;
  let m = l.baseMedianMin;
  if (c.match.result === 'win') m *= l.winLingerFactor;
  if (c.match.result === 'loss') m *= l.lossHurryFactor;
  if (c.match.weather === 'rain') m *= l.rainHurryFactor;
  if (c.match.weather === 'cold') m *= l.coldHurryFactor;
  const [h] = c.match.kickoff.split(':').map(Number);
  if (h >= 20) m *= l.lateKickoffHurryFactor;
  return m;
}

export function naturalDepart(c: SimConfig, median: number, z: number): number {
  return Math.min(c.horizonMin * 0.75, Math.max(0.5, median * Math.exp(c.leaving.sigma * z)));
}

/** Share of fans who have left by minute t under the natural (log-normal) curve. */
export function naturalCdf(c: SimConfig, median: number, t: number): number {
  if (t <= 0) return 0;
  return normCdf(Math.log(t / median) / c.leaving.sigma);
}
