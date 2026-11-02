import { INCENTIVES, type IncentiveId, type SimConfig } from '../sim/config';
import { checkIncentive, consume, expectedTakers, initialBudget, ruleBasedIncentive } from '../sim/incentives';
import type { Plan } from '../sim/optimizer';
import { ruleDecision } from './fallback';
import type { DecisionSource, GeminiDecision, ResolvedDecision, ValidationLogEntry } from './types';

/**
 * Validates Gemini's choices against the reward budget in optimizer priority order.
 * Invalid or missing decisions are replaced by the rule-based fallback and logged.
 */
export function resolveDecisions(
  c: SimConfig,
  plan: Plan,
  raw: GeminiDecision[] | null,
  source: DecisionSource,
): { decisions: Record<string, ResolvedDecision>; log: ValidationLogEntry[] } {
  const byId = new Map((raw ?? []).map((d) => [d.blockId, d]));
  const budget = initialBudget(c);
  const decisions: Record<string, ResolvedDecision> = {};
  const log: ValidationLogEntry[] = [];
  for (const bp of [...plan.blocks].sort((a, b) => a.priorityRank - b.priorityRank)) {
    const g = byId.get(bp.blockId);
    const fallbackInc = (): IncentiveId =>
      bp.isAway || !bp.planned ? 'none' : ruleBasedIncentive(c, bp.mix, bp.ptUsers, bp.delayMin, budget);
    if (!g) {
      const inc = fallbackInc();
      consume(c, budget, inc, expectedTakers(c, bp.ptUsers, bp.mix, inc), bp.delayMin);
      decisions[bp.blockId] = { ...ruleDecision(c, bp, inc), source: 'rule' };
      if (raw) log.push({ blockId: bp.blockId, message: 'Missing in Gemini response → rule-based fallback.' });
      continue;
    }
    let inc = g.incentive;
    let note: string | undefined;
    const forcedNone = bp.isAway || !bp.planned;
    const check = INCENTIVES.includes(inc)
      ? checkIncentive(c, inc, bp.delayMin, expectedTakers(c, bp.ptUsers, bp.mix, inc), budget)
      : { ok: false, reason: `unknown incentive "${inc}"` };
    if (forcedNone && inc !== 'none') {
      note = 'Away/unplanned blocks never get rewards → set to "none".';
      inc = 'none';
    } else if (!check.ok) {
      inc = fallbackInc();
      note = `Rejected "${g.incentive}": ${check.reason} → rule-based "${inc}".`;
    }
    consume(c, budget, inc, expectedTakers(c, bp.ptUsers, bp.mix, inc), bp.delayMin);
    if (note) {
      log.push({ blockId: bp.blockId, message: note });
      const rule = ruleDecision(c, bp, inc);
      decisions[bp.blockId] = {
        ...g,
        incentive: inc,
        incentiveReason: rule.incentiveReason,
        fanMessage: rule.fanMessage,
        source,
        proposedIncentive: g.incentive,
        validationNote: note,
      };
    } else {
      decisions[bp.blockId] = {
        ...g,
        language: g.language === 'en' ? 'en' : 'de',
        fanMessage: g.fanMessage.slice(0, 200),
        source,
      };
    }
  }
  return { decisions, log };
}

export function incentivesOf(decisions: Record<string, ResolvedDecision>): Record<string, IncentiveId> {
  return Object.fromEntries(Object.entries(decisions).map(([k, d]) => [k, d.incentive]));
}
