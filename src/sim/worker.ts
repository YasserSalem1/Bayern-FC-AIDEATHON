/// <reference lib="webworker" />
import type { IncentiveId, SimConfig } from './config';
import { planFor, runScenarios, type Planned } from './pipeline';

export type WorkerRequest =
  | { type: 'plan'; id: number; config: SimConfig }
  | { type: 'run'; id: number; config: SimConfig; incentives: Record<string, IncentiveId> };

let cached: { key: string; planned: Planned } | null = null;

function getPlanned(config: SimConfig): Planned {
  const key = JSON.stringify(config);
  if (!cached || cached.key !== key) cached = { key, planned: planFor(config) };
  return cached.planned;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    const planned = getPlanned(msg.config);
    if (msg.type === 'plan') {
      self.postMessage({ type: 'plan', id: msg.id, plan: planned.plan, blocks: planned.pop.blocks });
    } else {
      const results = runScenarios(msg.config, planned, msg.incentives);
      self.postMessage({ type: 'results', id: msg.id, results });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: (err as Error).message });
  }
};
