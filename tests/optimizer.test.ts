import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig, shuttleThroughput, u6Throughput, type SimConfig } from '../src/sim/config';
import { projectQueue } from '../src/sim/optimizer';
import { planFor, ruleIncentives, runScenarios } from '../src/sim/pipeline';

function variants(): [string, SimConfig][] {
  const rain = cloneConfig(DEFAULT_CONFIG);
  rain.match = { ...rain.match, result: 'loss', weather: 'rain' };
  const lowAdoption = cloneConfig(DEFAULT_CONFIG);
  lowAdoption.appAdoption = 0.4;
  lowAdoption.seed = 7;
  const tight = cloneConfig(DEFAULT_CONFIG);
  tight.optimizer.u6QueueTarget = 400;
  tight.shuttle.buses = 6;
  return [
    ['default', DEFAULT_CONFIG],
    ['loss in rain', rain],
    ['low adoption, other seed', lowAdoption],
    ['tight targets', tight],
  ];
}

describe('optimizer', () => {
  it.each(variants())('never plans a wave into a slot that would exceed capacity (%s)', (_name, c) => {
    const { plan } = planFor(c);
    const margin = 1 - c.optimizer.capacityMargin;
    for (const [route, rate, target] of [
      ['u6', u6Throughput(c) * margin, c.optimizer.u6QueueTarget],
      ['shuttle', shuttleThroughput(c) * margin, c.optimizer.shuttleQueueTarget],
    ] as const) {
      const base = plan.slots.map((s) => (route === 'u6' ? s.u6Baseline : s.shuttleBaseline));
      const planned = plan.slots.map((s) => (route === 'u6' ? s.u6Planned : s.shuttlePlanned));
      const cap = plan.slots.map(() => rate * plan.slotMin);
      const withPlan = projectQueue(base.map((b, i) => b + planned[i]), cap);
      const baseline = projectQueue(base, cap);
      for (let s = 0; s < plan.slots.length; s++) {
        // Wherever planned waves change the projected queue, it stays within the target (rounding tolerance).
        if (withPlan[s] > baseline[s] + 1) expect(withPlan[s]).toBeLessThanOrEqual(target + 2);
        if (planned[s] > 0) expect(withPlan[s]).toBeLessThanOrEqual(target + 2);
      }
    }
  });

  it.each(variants())('never changes away-fan routes (%s)', (_name, c) => {
    const { plan } = planFor(c);
    const away = plan.blocks.filter((b) => b.isAway);
    expect(away.length).toBeGreaterThan(0);
    for (const b of away) {
      expect(b.route).toBe('u6South');
      expect(b.waveMin).toBe(0);
      expect(b.candidates).toHaveLength(0);
    }
    for (const b of plan.blocks.filter((x) => !x.isAway)) expect(b.route).not.toBe('u6South');
  });

  it('keeps away fans on their fixed route in every simulated scenario', () => {
    const c = DEFAULT_CONFIG;
    const planned = planFor(c);
    const results = runScenarios(c, planned, ruleIncentives(c, planned.plan));
    const awayFans = planned.pop.blocks.filter((b) => b.isAway).reduce((a, b) => a + b.size, 0);
    for (const r of Object.values(results)) expect(r.summary.routeStats.u6South.users).toBe(awayFans);
  });

  it('is deterministic: same seed → identical plan and results', () => {
    const a = planFor(DEFAULT_CONFIG);
    const b = planFor(cloneConfig(DEFAULT_CONFIG));
    expect(JSON.stringify(a.plan)).toBe(JSON.stringify(b.plan));
    const inc = ruleIncentives(DEFAULT_CONFIG, a.plan);
    const ra = runScenarios(DEFAULT_CONFIG, a, inc);
    const rb = runScenarios(DEFAULT_CONFIG, b, inc);
    for (const id of ['none', 'naive', 'ai'] as const) {
      expect(ra[id].summary).toEqual(rb[id].summary);
      expect(Array.from(ra[id].series.u6Queue)).toEqual(Array.from(rb[id].series.u6Queue));
    }
  });

  it('a different seed gives a different population', () => {
    const c2 = cloneConfig(DEFAULT_CONFIG);
    c2.seed = 42;
    expect(Array.from(planFor(c2).pop.z.slice(0, 50))).not.toEqual(Array.from(planFor(DEFAULT_CONFIG).pop.z.slice(0, 50)));
  });

  it('assigns every fan to a block and keeps the total', () => {
    const { pop } = planFor(DEFAULT_CONFIG);
    expect(pop.blocks.reduce((a, b) => a + b.size, 0)).toBe(DEFAULT_CONFIG.totalFans);
    expect(pop.blocks).toHaveLength(24);
  });
});
