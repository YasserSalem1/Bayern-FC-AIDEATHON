import { INCENTIVE_LABEL, ROUTE_LABEL, type SimConfig, formatClock, whistleClockMin } from './config';
import { rewardText } from '../gemini/context';
import type { ChatState, ResolvedDecision } from '../gemini/types';
import type { BlockPlan, Plan, PlannedRoute } from './optimizer';
import type { BlockInfo } from './population';
import { walkSpeed, type ScenarioResult } from './simulate';

const AVG_ONWARD_MIN = 10;

/** Minute after the whistle shown in Pitch Mode's fan step; cached chat answers are generated for it. */
export const FAN_DEMO_MINUTE = 8;

function at(arr: Float32Array, minute: number): number {
  const m = Math.max(0, Math.min(arr.length - 1, minute));
  const lo = Math.floor(m);
  const hi = Math.min(arr.length - 1, lo + 1);
  return arr[lo] + (arr[hi] - arr[lo]) * (m - lo);
}

export interface TripEstimate {
  /** Minutes after the whistle at which the fan should be home. */
  home: number;
  /** Minutes standing in a queue on the way. */
  queue: number;
}

/** Trip estimate for a fan leaving at `departMin` on `route`, using the AI scenario's projected queues. */
export function estimateTrip(c: SimConfig, res: ScenarioResult, block: BlockInfo, departMin: number, route: PlannedRoute): TripEstimate {
  const s = res.series;
  const gate = departMin + block.egressMin;
  if (route === 'shuttle') {
    const ta = gate + c.shuttle.walkMin;
    const queue = at(s.shuttleExpectedWait, ta);
    return { home: ta + queue + c.shuttle.rideMin + AVG_ONWARD_MIN, queue };
  }
  const walkers = route === 'u6South' ? at(s.walkwaySouth, gate) : at(s.walkwayNorth, gate);
  const ta = gate + c.u6.walkMin / walkSpeed(c, walkers, route === 'u6South' ? c.u6.awayWalkwayAreaM2 / c.u6.walkwayAreaM2 : 1);
  const queue = at(s.u6ExpectedWait, ta);
  return { home: ta + queue + c.u6.rideMin + AVG_ONWARD_MIN, queue };
}

/** "Leave now" means the fan's natural route: the U6 (away fans: their fixed lane). */
export function naturalRoute(bp: BlockPlan): PlannedRoute {
  return bp.isAway ? 'u6South' : 'u6North';
}

export function buildChatState(
  c: SimConfig,
  t: number,
  bp: BlockPlan,
  block: BlockInfo,
  decision: ResolvedDecision | undefined,
  res: ScenarioResult,
): ChatState {
  const w = whistleClockMin(c);
  const m = Math.max(0, Math.min(c.horizonMin, Math.floor(t)));
  const s = res.series;
  const inc = decision?.incentive ?? 'none';
  const waveStart = Math.max(bp.waveMin, t);
  const now = estimateTrip(c, res, block, t, naturalRoute(bp));
  const wave = estimateTrip(c, res, block, waveStart, bp.route);
  return {
    simMinuteAfterWhistle: m,
    clockNow: formatClock(w + t),
    finalWhistle: formatClock(w),
    fanBlock: bp.blockId,
    assignedRoute: ROUTE_LABEL[bp.route],
    exitWaveStart: formatClock(w + bp.waveMin),
    exitWaveEnd: formatClock(w + bp.waveEndMin),
    minutesUntilWave: Math.max(0, Math.round(bp.waveMin - t)),
    incentive: INCENTIVE_LABEL[inc],
    rewardOffered: rewardText(c, inc, bp.delayMin),
    estimatedHomeIfLeaveNow: formatClock(w + now.home),
    minutesInQueueIfLeaveNow: Math.round(now.queue),
    estimatedHomeIfLeaveAtWave: formatClock(w + wave.home),
    minutesInQueueIfLeaveAtWave: Math.round(wave.queue),
    u6QueueNow: Math.round(s.u6Queue[m]),
    u6ExpectedWaitMinNow: Math.round(s.u6ExpectedWait[m]),
    esplanadeDensityNow: Math.round(s.densityNorth[m] * 100) / 100,
    esplanadeSafeDensity: c.u6.safeDensity,
    shuttleQueueNow: Math.round(s.shuttleQueue[m]),
    shuttleExpectedWaitMinNow: Math.round(s.shuttleExpectedWait[m]),
    carParkQueueNow: Math.round(s.carQueue[m]),
    fansStillInStadium: Math.round(s.inStadium[m]),
    fansHome: Math.round(s.home[m]),
    trainEveryMin: c.u6.trainHeadwayMin,
    trainCapacity: c.u6.trainCapacity,
    match: `${c.match.result}, ${c.match.weather}, kick-off ${c.match.kickoff}`,
  };
}

/** Fan block shown by default in the fan view (first block asked to wait); also used for cached chat answers. */
export function defaultFanBlock(plan: Plan, minDelay: number): string | undefined {
  return plan.blocks
    .filter((b) => !b.isAway && b.planned && b.delayMin >= minDelay)
    .sort((a, b) => a.delayMin - b.delayMin || a.index - b.index)[0]?.blockId;
}
