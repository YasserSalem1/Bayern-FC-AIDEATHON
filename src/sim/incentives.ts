import { INCENTIVES, SEGMENTS, type IncentiveId, type SegmentId, type SimConfig } from './config';

/** Probability that a fan who sees advice to leave immediately (no waiting) follows the route tip. */
export const ROUTE_ONLY_FOLLOW = 0.85;

export function mixAcceptance(c: SimConfig, mix: Record<SegmentId, number>, inc: IncentiveId): number {
  let a = 0;
  for (const s of SEGMENTS) a += (mix[s] ?? 0) * c.segments[s].acceptance[inc];
  return a;
}

/** Probability that one fan of segment `seg` follows the plan (app adoption × acceptance). */
export function complianceProb(c: SimConfig, seg: SegmentId, inc: IncentiveId, delayMin: number): number {
  if (seg === 'away') return 1;
  const accept = delayMin < c.rewards.minDelayForIncentiveMin ? ROUTE_ONLY_FOLLOW : c.segments[seg].acceptance[inc];
  return c.appAdoption * accept;
}

export interface Budget {
  storePoints: number;
  cafeSeats: number;
  lotteryEntries: number;
}

export function initialBudget(c: SimConfig): Budget {
  return {
    storePoints: c.rewards.storePointsBudget,
    cafeSeats: c.rewards.cafeSeats,
    lotteryEntries: c.rewards.lotteryEntriesMax,
  };
}

/** Points shown to the fan for an incentive. */
export function incentivePoints(c: SimConfig, inc: IncentiveId, delayMin: number): number {
  if (inc === 'store_points') return Math.round(delayMin * c.rewards.pointsPerMinuteWaited);
  if (inc === 'partner_cafe_points') return c.rewards.cafePointsPerFan;
  return 0;
}

/** Budget consumed if `fans` people accept this incentive. */
function cost(c: SimConfig, inc: IncentiveId, fans: number, delayMin: number): Partial<Budget> {
  if (inc === 'store_points') return { storePoints: fans * delayMin * c.rewards.pointsPerMinuteWaited };
  if (inc === 'partner_cafe_points') return { cafeSeats: fans };
  if (inc === 'ticket_lottery_entry') return { lotteryEntries: fans };
  return {};
}

export interface IncentiveCheck {
  ok: boolean;
  reason?: string;
}

export function checkIncentive(
  c: SimConfig,
  inc: IncentiveId,
  delayMin: number,
  expectedTakers: number,
  budget: Budget,
): IncentiveCheck {
  if (!INCENTIVES.includes(inc)) return { ok: false, reason: `unknown incentive "${inc}"` };
  if (delayMin < c.rewards.minDelayForIncentiveMin && inc !== 'none')
    return { ok: false, reason: `delay ${delayMin} min is below the ${c.rewards.minDelayForIncentiveMin} min minimum for rewards` };
  if (inc === 'ticket_lottery_entry' && delayMin < c.rewards.lotteryMinDelayMin)
    return { ok: false, reason: `lottery entries require a delay of at least ${c.rewards.lotteryMinDelayMin} min` };
  const k = cost(c, inc, expectedTakers, delayMin);
  if ((k.storePoints ?? 0) > budget.storePoints) return { ok: false, reason: 'store-points budget exhausted' };
  if ((k.cafeSeats ?? 0) > budget.cafeSeats) return { ok: false, reason: 'partner cafés are full' };
  if ((k.lotteryEntries ?? 0) > budget.lotteryEntries) return { ok: false, reason: 'lottery entry pool exhausted' };
  return { ok: true };
}

export function consume(c: SimConfig, budget: Budget, inc: IncentiveId, takers: number, delayMin: number): void {
  const k = cost(c, inc, takers, delayMin);
  budget.storePoints -= k.storePoints ?? 0;
  budget.cafeSeats -= k.cafeSeats ?? 0;
  budget.lotteryEntries -= k.lotteryEntries ?? 0;
}

export function expectedTakers(c: SimConfig, ptUsers: number, mix: Record<SegmentId, number>, inc: IncentiveId): number {
  return Math.round(ptUsers * c.appAdoption * mixAcceptance(c, mix, inc));
}

/** Rule-based choice: the valid incentive with the highest expected acceptance for this block's mix. */
export function ruleBasedIncentive(
  c: SimConfig,
  mix: Record<SegmentId, number>,
  ptUsers: number,
  delayMin: number,
  budget: Budget,
): IncentiveId {
  let best: IncentiveId = 'none';
  let bestAcc = -1;
  for (const inc of INCENTIVES) {
    const takers = expectedTakers(c, ptUsers, mix, inc);
    if (!checkIncentive(c, inc, delayMin, takers, budget).ok) continue;
    const a = mixAcceptance(c, mix, inc);
    if (a > bestAcc + 1e-9) {
      best = inc;
      bestAcc = a;
    }
  }
  return best;
}
