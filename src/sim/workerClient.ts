import type { IncentiveId, ScenarioId, SimConfig } from './config';
import type { Plan } from './optimizer';
import type { BlockInfo } from './population';
import type { ScenarioResult } from './simulate';
import type { WorkerRequest } from './worker';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.type === 'error') p.reject(new Error(e.data.message));
      else p.resolve(e.data);
    };
  }
  return worker;
}

type RequestBody = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, 'id'> : never) : never;

function call<T>(msg: RequestBody): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...msg, id });
  });
}

export function requestPlan(config: SimConfig): Promise<{ plan: Plan; blocks: BlockInfo[] }> {
  return call({ type: 'plan', config });
}

export function requestRun(
  config: SimConfig,
  incentives: Record<string, IncentiveId>,
): Promise<{ results: Record<ScenarioId, ScenarioResult> }> {
  return call({ type: 'run', config, incentives });
}
