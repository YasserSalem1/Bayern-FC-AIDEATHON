import { describe, expect, it } from 'vitest';
import { buildDecisionRequest } from '../src/gemini/context';
import type { GeminiDecision } from '../src/gemini/types';
import { resolveDecisions } from '../src/gemini/validate';
import { DEFAULT_CONFIG } from '../src/sim/config';
import { planFor } from '../src/sim/pipeline';

describe('Gemini decision validation', () => {
  const { plan } = planFor(DEFAULT_CONFIG);

  it('replaces invalid incentives with the rule-based fallback and logs it', () => {
    const early = plan.blocks.find((b) => !b.isAway && b.planned && b.delayMin < DEFAULT_CONFIG.rewards.lotteryMinDelayMin && b.delayMin >= 10);
    const raw: GeminiDecision[] = plan.blocks.map((b) => ({
      blockId: b.blockId,
      incentive: b.blockId === early?.blockId ? 'ticket_lottery_entry' : b.isAway ? 'store_points' : 'none',
      incentiveReason: 'x',
      decisionExplanation: 'y',
      fanMessage: 'z'.repeat(300),
      language: 'de',
    }));
    const { decisions, log } = resolveDecisions(DEFAULT_CONFIG, plan, raw, 'live');
    for (const b of plan.blocks.filter((x) => x.isAway)) expect(decisions[b.blockId].incentive).toBe('none');
    if (early) {
      expect(decisions[early.blockId].incentive).not.toBe('ticket_lottery_entry');
      expect(decisions[early.blockId].proposedIncentive).toBe('ticket_lottery_entry');
    }
    expect(log.length).toBeGreaterThan(0);
    for (const d of Object.values(decisions)) expect(d.fanMessage.length).toBeLessThanOrEqual(200);
  });

  it('falls back to rule-based decisions when Gemini returns nothing', () => {
    const { decisions } = resolveDecisions(DEFAULT_CONFIG, plan, null, 'rule');
    expect(Object.keys(decisions)).toHaveLength(24);
    expect(Object.values(decisions).every((d) => d.source === 'rule')).toBe(true);
  });

  it('builds a request that only offers valid incentives', () => {
    const req = buildDecisionRequest(DEFAULT_CONFIG, plan);
    for (const b of req.blocks) {
      if (b.waveStartMinAfterWhistle < DEFAULT_CONFIG.rewards.minDelayForIncentiveMin) expect(b.allowedIncentives.map((a) => a.id)).toEqual(['none']);
    }
  });
});
