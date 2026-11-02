import type { IncentiveId, ScenarioId, SimConfig } from './config';
import { consume, expectedTakers, initialBudget, ruleBasedIncentive } from './incentives';
import { optimize, type Plan } from './optimizer';
import { buildPopulation, type Population } from './population';
import { simulate, type ScenarioResult } from './simulate';

export interface Planned {
  pop: Population;
  plan: Plan;
}

export function planFor(c: SimConfig): Planned {
  const pop = buildPopulation(c);
  return { pop, plan: optimize(c, pop) };
}

/** Rule-based incentives for every block, consuming the reward budget in priority order. */
export function ruleIncentives(c: SimConfig, plan: Plan): Record<string, IncentiveId> {
  const budget = initialBudget(c);
  const out: Record<string, IncentiveId> = {};
  for (const bp of [...plan.blocks].sort((a, b) => a.priorityRank - b.priorityRank)) {
    if (bp.isAway || !bp.planned) {
      out[bp.blockId] = 'none';
      continue;
    }
    const inc = ruleBasedIncentive(c, bp.mix, bp.ptUsers, bp.delayMin, budget);
    consume(c, budget, inc, expectedTakers(c, bp.ptUsers, bp.mix, inc), bp.delayMin);
    out[bp.blockId] = inc;
  }
  return out;
}

export function runScenarios(
  c: SimConfig,
  planned: Planned,
  incentives: Record<string, IncentiveId>,
  ids: ScenarioId[] = ['none', 'naive', 'ai'],
): Record<ScenarioId, ScenarioResult> {
  const out = {} as Record<ScenarioId, ScenarioResult>;
  for (const id of ids) out[id] = simulate(c, planned.pop, id, id === 'ai' ? { plan: planned.plan, incentives } : undefined);
  return out;
}
