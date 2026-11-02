/**
 * Agent-based exit simulation (one agent = one fan, 30-second steps).
 *
 * Stages: seated → egress (seat to gate) → walking (route) → queue → riding → home.
 * - Walkers on the wide Esplanade slow down with density (Greenshields: v = v0·(1 − ρ/ρjam)).
 * - The U6 station holds `platformCapacity` people; everyone beyond that is
 *   held back on the station approach (bridge & stairs). Approach density =
 *   (held + walkers in the final section) / approach area – this is the safety metric.
 * - A train every `trainHeadwayMin` takes up to `trainCapacity` people; an
 *   overcrowded station loses `crowdedBoardingLoss` of that capacity.
 * - Shuttle buses load one at a time and leave when full or after a 2-min dwell.
 * - Car parks release vehicles at vehicles / clearMin.
 */
import {
  SEGMENTS,
  type IncentiveId,
  type RouteId,
  type ScenarioId,
  type SimConfig,
  shuttleThroughput,
  u6Throughput,
} from './config';
import { complianceProb } from './incentives';
import type { Plan } from './optimizer';
import { MODE_CAR, MODE_OTHER, MODE_PT, leavingMedian, naturalDepart, type Population } from './population';

export const ROUTES: RouteId[] = ['u6North', 'u6South', 'shuttle', 'car', 'other'];
export const R_U6N = 0;
export const R_U6S = 1;
export const R_SH = 2;
export const R_CAR = 3;
export const R_OTHER = 4;
/** Walk from the gate to the coach parks / taxi ranks for the "other" mode. */
const OTHER_WALK_MIN = 8;
export const DT = 0.5;
export const NEVER = 1e9;
const BUS_DWELL_MIN = 2;
/** Share of walkers who are inside the final station-approach section at any moment. */
const APPROACH_SHARE = 0.15;

/** Walking speed factor on the Esplanade (areaScale < 1 for the narrower away lane). */
export function walkSpeed(c: SimConfig, walkers: number, areaScale: number): number {
  const rho = walkers / (c.u6.esplanadeAreaM2 * Math.max(0.05, areaScale));
  return Math.max(0.15, 1 - rho / c.u6.jamDensity);
}

export interface Series {
  inStadium: Float32Array;
  walkwayNorth: Float32Array;
  densityNorth: Float32Array;
  walkwaySouth: Float32Array;
  densitySouth: Float32Array;
  u6Queue: Float32Array;
  shuttleQueue: Float32Array;
  carQueue: Float32Array;
  riding: Float32Array;
  home: Float32Array;
  /** Average queue wait of fans who boarded a U6 train in this minute. */
  u6BoardWait: Float32Array;
  /** Wait a fan joining the U6 queue now should expect (queue ÷ throughput). */
  u6ExpectedWait: Float32Array;
  shuttleExpectedWait: Float32Array;
  /** Naive app recommendation: 0 = U6, 2 = shuttle, -1 = n/a. */
  naiveRec: Int8Array;
}

export interface RouteStat {
  users: number;
  avgTimeToHome: number;
  avgWait: number;
}

export interface BlockStat {
  blockId: string;
  compliance: number;
  avgTimeToHome: number;
  avgWait: number;
  avgDepart: number;
}

export interface Summary {
  peakU6Queue: number;
  peakShuttleQueue: number;
  peakCarQueue: number;
  peakDensity: number;
  minutesAboveSafe: number;
  avgWait: number;
  worstWait: number;
  p95Wait: number;
  avgTimeToHome: number;
  avgStayInStadium: number;
  homeBy90: number;
  notHome: number;
  compliance: number;
  routeStats: Record<RouteId, RouteStat>;
}

export interface Dots {
  count: number;
  block: Uint8Array;
  route: Uint8Array;
  compliant: Uint8Array;
  depart: Float32Array;
  tGate: Float32Array;
  tQueue: Float32Array;
  tBoard: Float32Array;
  jitter: Float32Array;
  jitter2: Float32Array;
}

export interface ScenarioResult {
  id: ScenarioId;
  series: Series;
  summary: Summary;
  dots: Dots;
  /** Cumulative walkway progress (fraction of route) per DT step – for dot positions. */
  cumNorth: Float32Array;
  cumSouth: Float32Array;
  blockStats: BlockStat[];
}

export interface AiInputs {
  plan: Plan;
  incentives: Record<string, IncentiveId>;
}

/** Simple FIFO over a preallocated typed array. */
class Fifo {
  buf: Int32Array;
  head = 0;
  tail = 0;
  constructor(n: number) {
    this.buf = new Int32Array(n);
  }
  push(i: number) {
    this.buf[this.tail++] = i;
  }
  shift(): number {
    return this.buf[this.head++];
  }
  get length() {
    return this.tail - this.head;
  }
}

export function simulate(c: SimConfig, pop: Population, scenario: ScenarioId, ai?: AiInputs): ScenarioResult {
  const n = pop.n;
  const H = c.horizonMin;
  const nSteps = Math.round(H / DT);
  const median = leavingMedian(c);

  const depart = new Float32Array(n);
  const route = new Uint8Array(n);
  const compliant = new Uint8Array(n);
  const naiveFollower = new Uint8Array(n);
  const tGate = new Float32Array(n).fill(NEVER);
  const tQueue = new Float32Array(n).fill(NEVER);
  const tBoard = new Float32Array(n).fill(NEVER);
  const tHome = new Float32Array(n).fill(NEVER);
  const progress = new Float32Array(n);

  const blockPlans = ai?.plan.blocks;
  for (let i = 0; i < n; i++) {
    const seg = SEGMENTS[pop.segment[i]];
    const b = pop.block[i];
    const away = pop.blocks[b].isAway;
    depart[i] = naturalDepart(c, median, pop.z[i]);
    const mode = pop.mode[i];
    route[i] = mode === MODE_CAR ? R_CAR : mode === MODE_OTHER ? R_OTHER : away ? R_U6S : pop.natShuttle[i] ? R_SH : R_U6N;
    if (away) compliant[i] = 1;
    if (mode !== MODE_PT || away) continue;
    if (scenario === 'naive') {
      if (pop.uComply[i] < c.appAdoption * c.naive.followRate) naiveFollower[i] = 1;
    } else if (scenario === 'ai' && blockPlans) {
      const bp = blockPlans[b];
      if (!bp.planned) continue;
      const inc = ai!.incentives[bp.blockId] ?? 'none';
      if (pop.uComply[i] < complianceProb(c, seg, inc, bp.delayMin)) {
        compliant[i] = 1;
        depart[i] = bp.waveMin + pop.uWave[i] * (bp.waveEndMin - bp.waveMin);
        route[i] = bp.route === 'shuttle' ? R_SH : R_U6N;
      }
    }
  }

  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => depart[a] - depart[b] || a - b);

  const minutes = H + 1;
  const series: Series = {
    inStadium: new Float32Array(minutes),
    walkwayNorth: new Float32Array(minutes),
    densityNorth: new Float32Array(minutes),
    walkwaySouth: new Float32Array(minutes),
    densitySouth: new Float32Array(minutes),
    u6Queue: new Float32Array(minutes),
    shuttleQueue: new Float32Array(minutes),
    carQueue: new Float32Array(minutes),
    riding: new Float32Array(minutes),
    home: new Float32Array(minutes),
    u6BoardWait: new Float32Array(minutes),
    u6ExpectedWait: new Float32Array(minutes),
    shuttleExpectedWait: new Float32Array(minutes),
    naiveRec: new Int8Array(minutes).fill(-1),
  };
  const cumNorth = new Float32Array(nSteps + 1);
  const cumSouth = new Float32Array(nSteps + 1);

  let ptr = 0;
  let egressing: number[] = [];
  let walkN: number[] = [];
  let walkS: number[] = [];
  let walkSh: number[] = [];
  let walkCar: number[] = [];
  let walkOther: number[] = [];
  let riding: number[] = [];
  const u6Q = new Fifo(n);
  const shQ = new Fifo(n);
  const carQ = new Fifo(n);
  let u6QNorth = 0;
  let homeCount = 0;
  let nextTrain = c.u6.trainHeadwayMin;
  const busReturn = new Float64Array(c.shuttle.buses);
  let loadingBus = -1;
  let loadingIds: number[] = [];
  let loadStart = 0;
  const carRatePerMin = (c.car.vehicles / c.car.clearMin) * c.car.peoplePerCar;
  let carAcc = 0;
  let naiveRec = R_SH;
  let boardWaitSum = 0;
  let boardWaitN = 0;
  let lastBoardWait = 0;
  let cn = 0;
  let cs = 0;
  const stepsPerMin = Math.round(1 / DT);

  const advance = (list: number[], d: number, arrive: (i: number) => void): number[] => {
    if (!list.length) return list;
    const still: number[] = [];
    for (const i of list) {
      progress[i] += d;
      if (progress[i] >= 1) arrive(i);
      else still.push(i);
    }
    return still;
  };

  const heldSplit = () => {
    const len = u6Q.length;
    const held = Math.max(0, len - c.u6.platformCapacity);
    const north = len > 0 ? (held * u6QNorth) / len : 0;
    return { north, south: held - north };
  };

  for (let step = 0; step <= nSteps; step++) {
    const t = step * DT;

    // Naive app: re-evaluate the "currently fastest" route at fixed intervals.
    if (scenario === 'naive' && step % Math.round(c.naive.updateEveryMin / DT) === 0) {
      const v = walkSpeed(c, walkN.length, 1);
      const estU6 = c.u6.walkMin / v + u6Q.length / u6Throughput(c) + c.u6.rideMin;
      const estSh = c.shuttle.walkMin + (shQ.length + loadingIds.length) / shuttleThroughput(c) + c.shuttle.rideMin;
      naiveRec = estSh < estU6 ? R_SH : R_U6N;
    }

    // 1. Departures from seats.
    while (ptr < n && depart[order[ptr]] <= t) {
      const i = order[ptr++];
      if (naiveFollower[i]) {
        route[i] = naiveRec;
        compliant[i] = 1;
      }
      egressing.push(i);
    }

    // 2. Reaching the gate.
    if (egressing.length) {
      const still: number[] = [];
      for (const i of egressing) {
        if (depart[i] + pop.egress[i] <= t) {
          tGate[i] = t;
          progress[i] = 0;
          const r = route[i];
          if (r === R_U6N) walkN.push(i);
          else if (r === R_U6S) walkS.push(i);
          else if (r === R_SH) walkSh.push(i);
          else if (r === R_CAR) walkCar.push(i);
          else walkOther.push(i);
        } else still.push(i);
      }
      egressing = still;
    }

    // 3. Walking. Esplanade speed depends on density (incl. people held at the station).
    const vN = walkSpeed(c, walkN.length, 1);
    const vS = walkSpeed(c, walkS.length, c.u6.awayWalkwayAreaM2 / c.u6.walkwayAreaM2);
    const dN = (DT / c.u6.walkMin) * vN;
    const dS = (DT / c.u6.walkMin) * vS;
    cn += dN;
    cs += dS;
    cumNorth[step] = cn;
    cumSouth[step] = cs;
    walkN = advance(walkN, dN, (i) => {
      tQueue[i] = t;
      u6Q.push(i);
      u6QNorth++;
    });
    walkS = advance(walkS, dS, (i) => {
      tQueue[i] = t;
      u6Q.push(i);
    });
    walkSh = advance(walkSh, DT / c.shuttle.walkMin, (i) => {
      tQueue[i] = t;
      shQ.push(i);
    });
    walkCar = advance(walkCar, DT / c.car.walkMin, (i) => {
      tQueue[i] = t;
      carQ.push(i);
    });
    // Coaches, taxis, bikes and walkers leave without a modelled bottleneck.
    walkOther = advance(walkOther, DT / OTHER_WALK_MIN, (i) => {
      tQueue[i] = t;
      tBoard[i] = t;
      tHome[i] = t + c.car.driveMin + pop.uHome[i] * 20;
      riding.push(i);
    });

    // 4. U6 trains.
    if (t >= nextTrain - 1e-9) {
      nextTrain += c.u6.trainHeadwayMin;
      const overcrowded = u6Q.length > c.u6.platformCapacity;
      const capacity = Math.floor(c.u6.trainCapacity * (overcrowded ? 1 - c.u6.crowdedBoardingLoss : 1));
      const board = Math.min(capacity, u6Q.length);
      for (let k = 0; k < board; k++) {
        const i = u6Q.shift();
        if (route[i] === R_U6N) u6QNorth--;
        tBoard[i] = t;
        tHome[i] = t + c.u6.rideMin + pop.uHome[i] * 20;
        riding.push(i);
        boardWaitSum += t - tQueue[i];
        boardWaitN++;
      }
    }

    // 5. Shuttle buses: one loads at a time, leaves when full or after the dwell time.
    for (let guard = 0; guard < c.shuttle.buses; guard++) {
      if (loadingBus < 0) {
        let b = -1;
        for (let k = 0; k < busReturn.length; k++) if (busReturn[k] <= t) { b = k; break; }
        if (b < 0) break;
        loadingBus = b;
        loadStart = t;
        loadingIds = [];
      }
      while (loadingIds.length < c.shuttle.seatsPerBus && shQ.length) loadingIds.push(shQ.shift());
      if (loadingIds.length === 0) {
        loadStart = t;
        break;
      }
      if (loadingIds.length >= c.shuttle.seatsPerBus || t - loadStart >= BUS_DWELL_MIN) {
        for (const i of loadingIds) {
          tBoard[i] = t;
          tHome[i] = t + c.shuttle.rideMin + pop.uHome[i] * 20;
          riding.push(i);
        }
        busReturn[loadingBus] = t + c.shuttle.roundTripMin;
        loadingBus = -1;
        loadingIds = [];
      } else break;
    }

    // 6. Car parks release vehicles at a fixed rate.
    carAcc += carRatePerMin * DT;
    while (carAcc >= 1 && carQ.length) {
      const i = carQ.shift();
      carAcc -= 1;
      tBoard[i] = t;
      tHome[i] = t + c.car.driveMin + pop.uHome[i] * 20;
      riding.push(i);
    }
    if (!carQ.length) carAcc = Math.min(carAcc, 1);

    // 7. Arriving home.
    if (riding.length) {
      const still: number[] = [];
      for (const i of riding) {
        if (tHome[i] <= t) homeCount++;
        else still.push(i);
      }
      riding = still;
    }

    // Per-minute metrics.
    if (step % stepsPerMin === 0) {
      const m = step / stepsPerMin;
      const h = heldSplit();
      series.inStadium[m] = n - ptr + egressing.length;
      series.walkwayNorth[m] = walkN.length + h.north;
      series.densityNorth[m] = (h.north + walkN.length * APPROACH_SHARE) / c.u6.walkwayAreaM2;
      series.walkwaySouth[m] = walkS.length + h.south;
      series.densitySouth[m] = (h.south + walkS.length * APPROACH_SHARE) / c.u6.awayWalkwayAreaM2;
      series.u6Queue[m] = u6Q.length;
      series.shuttleQueue[m] = shQ.length + loadingIds.length;
      series.carQueue[m] = carQ.length;
      series.riding[m] = riding.length;
      series.home[m] = homeCount;
      if (boardWaitN) lastBoardWait = boardWaitSum / boardWaitN;
      else if (!u6Q.length) lastBoardWait = 0;
      series.u6BoardWait[m] = lastBoardWait;
      boardWaitSum = 0;
      boardWaitN = 0;
      const eff = u6Q.length > c.u6.platformCapacity ? 1 - c.u6.crowdedBoardingLoss : 1;
      series.u6ExpectedWait[m] = u6Q.length / (u6Throughput(c) * eff);
      series.shuttleExpectedWait[m] = series.shuttleQueue[m] / shuttleThroughput(c);
      if (scenario === 'naive') series.naiveRec[m] = naiveRec;
    }
  }

  return {
    id: scenario,
    series,
    summary: summarize(c, pop, series, route, compliant, depart, tQueue, tBoard, tHome),
    dots: sampleDots(pop, route, compliant, depart, tGate, tQueue, tBoard),
    cumNorth,
    cumSouth,
    blockStats: blockStats(c, pop, route, compliant, depart, tQueue, tBoard, tHome),
  };
}

function waitOf(i: number, tQueue: Float32Array, tBoard: Float32Array, H: number): number {
  if (tQueue[i] >= NEVER) return 0;
  return (tBoard[i] >= NEVER ? H : tBoard[i]) - tQueue[i];
}

function summarize(
  c: SimConfig,
  pop: Population,
  s: Series,
  route: Uint8Array,
  compliant: Uint8Array,
  depart: Float32Array,
  tQueue: Float32Array,
  tBoard: Float32Array,
  tHome: Float32Array,
): Summary {
  const H = c.horizonMin;
  const n = pop.n;
  const waits: number[] = [];
  let homeSum = 0;
  let stay = 0;
  let notHome = 0;
  let by90 = 0;
  let comp = 0;
  let eligible = 0;
  const rs = {} as Record<RouteId, { users: number; home: number; wait: number }>;
  ROUTES.forEach((r) => (rs[r] = { users: 0, home: 0, wait: 0 }));
  for (let i = 0; i < n; i++) {
    const r = ROUTES[route[i]];
    const w = waitOf(i, tQueue, tBoard, H);
    const home = Math.min(tHome[i], H);
    if (tHome[i] > H) notHome++;
    if (tHome[i] <= 90) by90++;
    homeSum += home;
    stay += depart[i];
    rs[r].users++;
    rs[r].home += home;
    rs[r].wait += w;
    if (route[i] !== R_CAR && route[i] !== R_OTHER) waits.push(w);
    if (pop.mode[i] === MODE_PT && !pop.blocks[pop.block[i]].isAway) {
      eligible++;
      comp += compliant[i];
    }
  }
  waits.sort((a, b) => a - b);
  const routeStats = {} as Record<RouteId, RouteStat>;
  ROUTES.forEach((r) => {
    const x = rs[r];
    routeStats[r] = {
      users: x.users,
      avgTimeToHome: x.users ? x.home / x.users : 0,
      avgWait: x.users ? x.wait / x.users : 0,
    };
  });
  const maxOf = (a: Float32Array) => a.reduce((m, v) => (v > m ? v : m), 0);
  let above = 0;
  for (let m = 0; m < s.densityNorth.length; m++)
    if (s.densityNorth[m] > c.u6.safeDensity || s.densitySouth[m] > c.u6.safeDensity) above++;
  return {
    peakU6Queue: maxOf(s.u6Queue),
    peakShuttleQueue: maxOf(s.shuttleQueue),
    peakCarQueue: maxOf(s.carQueue),
    peakDensity: Math.max(maxOf(s.densityNorth), maxOf(s.densitySouth)),
    minutesAboveSafe: above,
    avgWait: waits.reduce((a, b) => a + b, 0) / Math.max(1, waits.length),
    worstWait: waits[waits.length - 1] ?? 0,
    p95Wait: waits[Math.floor(waits.length * 0.95)] ?? 0,
    avgTimeToHome: homeSum / n,
    avgStayInStadium: stay / n,
    homeBy90: by90 / n,
    notHome,
    compliance: eligible ? comp / eligible : 0,
    routeStats,
  };
}

function blockStats(
  c: SimConfig,
  pop: Population,
  route: Uint8Array,
  compliant: Uint8Array,
  depart: Float32Array,
  tQueue: Float32Array,
  tBoard: Float32Array,
  tHome: Float32Array,
): BlockStat[] {
  const acc = pop.blocks.map(() => ({ n: 0, pt: 0, comp: 0, home: 0, wait: 0, dep: 0 }));
  for (let i = 0; i < pop.n; i++) {
    const a = acc[pop.block[i]];
    a.n++;
    a.home += Math.min(tHome[i], c.horizonMin);
    a.dep += depart[i];
    if (route[i] !== R_CAR && route[i] !== R_OTHER) a.wait += waitOf(i, tQueue, tBoard, c.horizonMin);
    if (pop.mode[i] === MODE_PT) {
      a.pt++;
      a.comp += compliant[i];
    }
  }
  return pop.blocks.map((b, k) => {
    const a = acc[k];
    return {
      blockId: b.id,
      compliance: a.pt ? a.comp / a.pt : 0,
      avgTimeToHome: a.n ? a.home / a.n : 0,
      avgWait: a.pt ? a.wait / a.pt : 0,
      avgDepart: a.n ? a.dep / a.n : 0,
    };
  });
}

export const DOT_TARGET = 7500;

function sampleDots(
  pop: Population,
  route: Uint8Array,
  compliant: Uint8Array,
  depart: Float32Array,
  tGate: Float32Array,
  tQueue: Float32Array,
  tBoard: Float32Array,
): Dots {
  const stride = Math.max(1, Math.floor(pop.n / DOT_TARGET));
  const count = Math.floor(pop.n / stride);
  const d: Dots = {
    count,
    block: new Uint8Array(count),
    route: new Uint8Array(count),
    compliant: new Uint8Array(count),
    depart: new Float32Array(count),
    tGate: new Float32Array(count),
    tQueue: new Float32Array(count),
    tBoard: new Float32Array(count),
    jitter: new Float32Array(count),
    jitter2: new Float32Array(count),
  };
  for (let k = 0; k < count; k++) {
    const i = k * stride;
    d.block[k] = pop.block[i];
    d.route[k] = route[i];
    d.compliant[k] = compliant[i];
    d.depart[k] = depart[i];
    d.tGate[k] = tGate[i];
    d.tQueue[k] = tQueue[i];
    d.tBoard[k] = tBoard[i];
    d.jitter[k] = pop.uHome[i];
    d.jitter2[k] = pop.uWave[i];
  }
  return d;
}
