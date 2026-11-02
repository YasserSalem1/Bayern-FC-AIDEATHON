/**
 * Exit-wave optimizer: greedy time-slot capacity allocation.
 *
 * 1. Time after the final whistle is cut into slots (default 5 min).
 *    Each exit resource (U6 station, shuttle stop) has a capacity per slot
 *    (nominal throughput × slot length × (1 − safety margin)).
 * 2. Load that the optimizer cannot control is booked first ("baseline"):
 *    away fans (fixed route, police-escorted at the whistle) and the expected
 *    share of fans who will NOT follow the advice, spread over the natural
 *    leaving curve.
 * 3. Blocks are processed in priority order (highest wait aversion first,
 *    e.g. family blocks). For each block every candidate (start slot,
 *    window of 1–3 slots, route) is evaluated with a queue recursion
 *        q[s+1] = max(0, q[s] + load[s] − cap[s])
 *    A candidate is feasible only if the projected queue never exceeds the
 *    target in any slot it makes worse. Among feasible candidates the one
 *    with the lowest expected cost per fan is chosen:
 *        cost = ½·waitAversion·(minutes in stadium) + walk + 1.5·(queue wait) + ride
 * 4. Car users are not re-routed (fixed car park); away fans never change route.
 *
 * Because each block is only admitted where the queue stays below target,
 * planned waves never exceed capacity (verified in tests/optimizer.test.ts).
 */
import { SEGMENTS, type RouteId, type SegmentId, type SimConfig, shuttleThroughput, u6Throughput } from './config';
import { mixAcceptance } from './incentives';
import { leavingMedian, naturalCdf, type Population } from './population';

export type PlannedRoute = Extract<RouteId, 'u6North' | 'u6South' | 'shuttle'>;

export interface Candidate {
  startMin: number;
  endMin: number;
  route: PlannedRoute;
  feasible: boolean;
  cost?: number;
  peakQueue: number;
  note: string;
}

export interface BlockPlan {
  blockId: string;
  index: number;
  isAway: boolean;
  /** False if no feasible wave existed: fans are advised to leave naturally. */
  planned: boolean;
  waveMin: number;
  waveEndMin: number;
  route: PlannedRoute;
  /** Minutes the block is asked to stay after the whistle (= wave start). */
  delayMin: number;
  size: number;
  ptUsers: number;
  carUsers: number;
  otherUsers: number;
  mix: Record<SegmentId, number>;
  waitAversion: number;
  priorityRank: number;
  planningAcceptance: number;
  expectedCompliant: number;
  projectedQueue: number;
  reasons: string[];
  candidates: Candidate[];
}

export interface SlotState {
  startMin: number;
  u6Cap: number;
  u6Baseline: number;
  u6Planned: number;
  u6Queue: number;
  shuttleCap: number;
  shuttleBaseline: number;
  shuttlePlanned: number;
  shuttleQueue: number;
}

export interface Plan {
  blocks: BlockPlan[];
  slots: SlotState[];
  slotMin: number;
  u6QueueTarget: number;
  shuttleQueueTarget: number;
  notes: string[];
}

const MAX_SPAN_SLOTS = 3;

export function projectQueue(load: number[], cap: number[]): number[] {
  const q: number[] = [];
  let cur = 0;
  for (let s = 0; s < load.length; s++) {
    cur = Math.max(0, cur + load[s] - cap[s]);
    q.push(cur);
  }
  return q;
}

/**
 * Adding `add` must not push the queue above `target` in any slot where it
 * changes the queue. Slots already above target from baseline load are
 * therefore closed to planned waves.
 */
function check(load: number[], cap: number[], add: number[], target: number): { ok: boolean; peak: number } {
  const before = projectQueue(load, cap);
  const after = projectQueue(
    load.map((l, i) => l + add[i]),
    cap,
  );
  let peak = 0;
  for (let s = 0; s < after.length; s++) {
    if (after[s] > before[s] + 1e-6) {
      peak = Math.max(peak, after[s]);
      if (after[s] > target + 1e-6) return { ok: false, peak: after[s] };
    }
  }
  return { ok: true, peak };
}

export function blockWaitAversion(c: SimConfig, mix: Record<SegmentId, number>): number {
  let w = 0;
  for (const s of SEGMENTS) w += (mix[s] ?? 0) * c.segments[s].waitAversion;
  return w;
}

/** Best acceptance over real incentives – what the optimizer assumes when planning. */
export function planningAcceptance(c: SimConfig, mix: Record<SegmentId, number>): number {
  const best = Math.max(
    mixAcceptance(c, mix, 'store_points'),
    mixAcceptance(c, mix, 'partner_cafe_points'),
    mixAcceptance(c, mix, 'ticket_lottery_entry'),
  );
  return c.appAdoption * best;
}

function naturalShuttleShareOfPt(c: SimConfig, counts: Record<SegmentId, number>, pt: number): number {
  if (pt <= 0) return 0;
  let sh = 0;
  for (const s of SEGMENTS) sh += counts[s] * (1 - c.segments[s].carShare - c.segments[s].otherShare) * c.segments[s].naturalShuttleShare;
  return sh / pt;
}

export function optimize(c: SimConfig, pop: Population): Plan {
  const slotMin = c.optimizer.slotMin;
  const nSlots = Math.ceil(c.horizonMin / slotMin);
  const maxStartSlot = Math.floor(c.optimizer.maxWaveMin / slotMin);
  const margin = 1 - c.optimizer.capacityMargin;
  const u6Cap = new Array(nSlots).fill(u6Throughput(c) * slotMin * margin);
  const shCap = new Array(nSlots).fill(shuttleThroughput(c) * slotMin * margin);
  const u6Base = new Array(nSlots).fill(0);
  const shBase = new Array(nSlots).fill(0);
  const u6Plan = new Array(nSlots).fill(0);
  const shPlan = new Array(nSlots).fill(0);
  const median = leavingMedian(c);
  const curve = (n: number, into: number[]) => {
    for (let s = 0; s < nSlots; s++) into[s] += n * (naturalCdf(c, median, (s + 1) * slotMin) - naturalCdf(c, median, s * slotMin));
  };

  // 1. Baseline: away fans + expected non-followers on their natural route & time.
  const plans: BlockPlan[] = pop.blocks.map((b) => {
    const mix = b.mix;
    const accept = b.isAway ? 1 : planningAcceptance(c, mix);
    if (b.isAway) curve(b.ptUsers, u6Base);
    else {
      const nonCompliant = b.ptUsers * (1 - accept);
      const sh = naturalShuttleShareOfPt(c, b.counts, b.ptUsers);
      curve(nonCompliant * (1 - sh), u6Base);
      curve(nonCompliant * sh, shBase);
    }
    return {
      blockId: b.id,
      index: b.index,
      isAway: b.isAway,
      planned: b.isAway,
      waveMin: 0,
      waveEndMin: 0,
      route: b.isAway ? 'u6South' : 'u6North',
      delayMin: 0,
      size: b.size,
      ptUsers: b.ptUsers,
      carUsers: b.carUsers,
      otherUsers: b.otherUsers,
      mix,
      waitAversion: blockWaitAversion(c, mix),
      priorityRank: 0,
      planningAcceptance: accept,
      expectedCompliant: b.isAway ? b.ptUsers : Math.round(b.ptUsers * accept),
      projectedQueue: 0,
      reasons: b.isAway
        ? [
            'Away block (Nordkurve): route is fixed to the Esplanade Süd lane and is never changed.',
            'Leaves at the whistle under steward escort; its load is booked first.',
          ]
        : [],
      candidates: [],
    };
  });

  // 2. Priority order: highest wait aversion first (families), then larger blocks.
  const order = plans
    .filter((p) => !p.isAway)
    .sort((a, b) => b.waitAversion - a.waitAversion || b.ptUsers - a.ptUsers || a.index - b.index);
  order.forEach((p, i) => (p.priorityRank = i + 1));

  const u6Target = c.optimizer.u6QueueTarget;
  const shTarget = c.optimizer.shuttleQueueTarget;
  const u6Rate = u6Throughput(c) * margin;
  const shRate = shuttleThroughput(c) * margin;

  for (const p of order) {
    const load = p.expectedCompliant;
    const rejected: Candidate[] = [];
    const feasible: Candidate[] = [];
    for (let s = 0; s <= maxStartSlot; s++) {
      for (let k = 1; k <= MAX_SPAN_SLOTS; k++) {
        if (s + k > nSlots) continue;
        for (const route of ['u6North', 'shuttle'] as const) {
          const isU6 = route === 'u6North';
          const base = (isU6 ? u6Base : shBase).map((v, i) => v + (isU6 ? u6Plan : shPlan)[i]);
          const cap = isU6 ? u6Cap : shCap;
          const add = new Array(nSlots).fill(0);
          for (let j = 0; j < k; j++) add[s + j] = load / k;
          const target = isU6 ? u6Target : shTarget;
          const res = check(base, cap, add, target);
          const startMin = s * slotMin;
          const endMin = (s + k) * slotMin;
          if (!res.ok) {
            if (k === 1 && rejected.length < 4)
              rejected.push({
                startMin,
                endMin,
                route,
                feasible: false,
                peakQueue: Math.round(res.peak),
                note: `${isU6 ? 'U6 queue' : 'Shuttle queue'} would reach ${Math.round(res.peak).toLocaleString('en')} (> target ${target.toLocaleString('en')})`,
              });
            continue;
          }
          const q = projectQueue(base.map((v, i) => v + add[i]), cap)[s];
          const wait = q / (isU6 ? u6Rate : shRate);
          const walk = isU6 ? c.u6.walkMin : c.shuttle.walkMin;
          const ride = isU6 ? c.u6.rideMin : c.shuttle.rideMin;
          const departMean = (startMin + endMin) / 2;
          const cost = 0.5 * p.waitAversion * departMean + walk + 1.5 * wait + ride + (k - 1) * 2;
          feasible.push({
            startMin,
            endMin,
            route,
            feasible: true,
            cost: Math.round(cost * 10) / 10,
            peakQueue: Math.round(res.peak),
            note: `expected queue wait ${wait.toFixed(1)} min`,
          });
        }
      }
    }
    feasible.sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0) || a.startMin - b.startMin);
    const best = feasible[0];
    p.candidates = [...rejected, ...feasible.slice(0, 3)];
    const famShare = Math.round((p.mix.families ?? 0) * 100);
    p.reasons.push(
      `Priority #${p.priorityRank} of ${order.length}: wait aversion ${p.waitAversion.toFixed(2)} (families ${famShare}%).`,
      `Expected followers: ${p.expectedCompliant.toLocaleString('en')} of ${p.ptUsers.toLocaleString('en')} public-transport fans (${Math.round(p.planningAcceptance * 100)}%).`,
    );
    if (!best) {
      p.planned = false;
      p.reasons.push(`No slot up to ${c.optimizer.maxWaveMin} min keeps queues below target → fans are advised to leave naturally.`);
      continue;
    }
    const isU6 = best.route === 'u6North';
    const s0 = best.startMin / slotMin;
    const k = (best.endMin - best.startMin) / slotMin;
    for (let j = 0; j < k; j++) (isU6 ? u6Plan : shPlan)[s0 + j] += load / k;
    p.planned = true;
    p.waveMin = best.startMin;
    p.waveEndMin = best.endMin;
    p.route = best.route;
    p.delayMin = best.startMin;
    p.projectedQueue = best.peakQueue;
    if (rejected.length) p.reasons.push(`Earlier slots rejected: ${rejected[0].note} at ${rejected[0].startMin}–${rejected[0].endMin} min.`);
    p.reasons.push(
      `Chosen: wave ${best.startMin}–${best.endMin} min via ${isU6 ? 'Esplanade → U6' : 'shuttle bus'} (cost ${best.cost}, ${best.note}).`,
    );
    if (!isU6) p.reasons.push('Shuttle buses still had spare seats while the U6 slots were full.');
  }

  const u6Load = u6Base.map((v, i) => v + u6Plan[i]);
  const shLoad = shBase.map((v, i) => v + shPlan[i]);
  const u6Q = projectQueue(u6Load, u6Cap);
  const shQ = projectQueue(shLoad, shCap);
  const slots: SlotState[] = u6Cap.map((_, s) => ({
    startMin: s * slotMin,
    u6Cap: Math.round(u6Cap[s]),
    u6Baseline: Math.round(u6Base[s]),
    u6Planned: Math.round(u6Plan[s]),
    u6Queue: Math.round(u6Q[s]),
    shuttleCap: Math.round(shCap[s]),
    shuttleBaseline: Math.round(shBase[s]),
    shuttlePlanned: Math.round(shPlan[s]),
    shuttleQueue: Math.round(shQ[s]),
  }));

  const notes = [
    `Natural leaving median: ${median.toFixed(1)} min after the whistle (${c.match.result}, ${c.match.weather}).`,
    `U6 planning capacity: ${Math.round(u6Rate)} fans/min; shuttle: ${Math.round(shRate)} fans/min.`,
  ];
  const unplanned = plans.filter((p) => !p.planned).length;
  if (unplanned) notes.push(`${unplanned} block(s) could not be placed within ${c.optimizer.maxWaveMin} min.`);
  return { blocks: plans, slots, slotMin, u6QueueTarget: u6Target, shuttleQueueTarget: shTarget, notes };
}
