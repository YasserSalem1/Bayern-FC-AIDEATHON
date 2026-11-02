import { INCENTIVES, ROUTE_LABEL, SEGMENTS, type SimConfig, formatClock, whistleClockMin } from '../sim/config';
import { checkIncentive, expectedTakers, incentivePoints, initialBudget, mixAcceptance } from '../sim/incentives';
import type { BlockPlan, Plan } from '../sim/optimizer';
import { hashString } from '../sim/rng';
import type { AllowedIncentive, DecisionRequest } from './types';

export function rewardText(c: SimConfig, inc: string, delayMin: number): string {
  if (inc === 'store_points') return `${incentivePoints(c, 'store_points', delayMin)} FC Bayern store points`;
  if (inc === 'partner_cafe_points') return `${c.rewards.cafePointsPerFan} points at a partner café`;
  if (inc === 'ticket_lottery_entry') return '1 entry into the ticket lottery';
  return 'no reward';
}

export function suggestedLanguage(bp: BlockPlan): 'de' | 'en' {
  return (bp.mix.international ?? 0) >= 0.3 ? 'en' : 'de';
}

export function allowedIncentives(c: SimConfig, bp: BlockPlan): AllowedIncentive[] {
  const budget = initialBudget(c);
  return INCENTIVES.filter((inc) =>
    checkIncentive(c, inc, bp.delayMin, expectedTakers(c, bp.ptUsers, bp.mix, inc), budget).ok,
  ).map((inc) => ({
    id: inc,
    expectedAcceptancePct: Math.round(mixAcceptance(c, bp.mix, inc) * 100),
    reward: rewardText(c, inc, bp.delayMin),
  }));
}

export function buildDecisionRequest(c: SimConfig, plan: Plan): DecisionRequest {
  const whistle = whistleClockMin(c);
  return {
    match: {
      result: c.match.result,
      weather: c.match.weather,
      kickoff: c.match.kickoff,
      finalWhistle: formatClock(whistle),
    },
    rules: [
      'Do not change wave times or routes; they come from the capacity optimizer.',
      'Pick exactly one incentive from allowedIncentives for each block.',
      'Away blocks and blocks leaving immediately get incentive "none".',
      'Write fanMessage in suggestedLanguage, max 200 characters, mention the wave time and route.',
      'Only use numbers given in the block context.',
    ],
    blocks: plan.blocks.map((bp) => {
      const mix: Record<string, number> = {};
      for (const s of SEGMENTS) if ((bp.mix[s] ?? 0) > 0) mix[s] = Math.round((bp.mix[s] ?? 0) * 100);
      return {
        blockId: bp.blockId,
        isAwayBlock: bp.isAway,
        fans: bp.size,
        publicTransportFans: bp.ptUsers,
        carFans: bp.carUsers,
        coachTaxiWalkFans: bp.otherUsers,
        segmentMixPct: mix,
        waveStartMinAfterWhistle: bp.waveMin,
        waveEndMinAfterWhistle: bp.waveEndMin,
        waveClock: `${formatClock(whistle + bp.waveMin)}–${formatClock(whistle + bp.waveEndMin)}`,
        route: ROUTE_LABEL[bp.route],
        priorityRank: bp.priorityRank,
        optimizerReasons: bp.reasons,
        allowedIncentives: allowedIncentives(c, bp),
        suggestedLanguage: suggestedLanguage(bp),
      };
    }),
  };
}

export function decisionKey(req: DecisionRequest): string {
  return hashString(JSON.stringify(req));
}

export function chatKey(question: string, block: string, minute: number): string {
  return hashString(`${question.trim().toLowerCase()}|${block}|${Math.floor(minute)}`);
}
