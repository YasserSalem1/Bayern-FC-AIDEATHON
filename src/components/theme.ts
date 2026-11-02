import type { ScenarioId } from '../sim/config';

/** Validated categorical palette (CVD-safe, see README). Red = AI to match the accent. */
export const SCENARIO_COLOR: Record<ScenarioId, string> = {
  none: '#2563EB',
  naive: '#E08A00',
  ai: '#DC052D',
};

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const pctChange = (from: number, to: number) => (from === 0 ? 0 : ((to - from) / from) * 100);
