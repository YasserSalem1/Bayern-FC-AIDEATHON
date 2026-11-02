/** Browser-side Gemini access: live via /api → cached JSON → rule-based fallback. */
import cache from '../data/gemini-cache.json';
import type { SimConfig } from '../sim/config';
import type { Plan } from '../sim/optimizer';
import { buildDecisionRequest, chatKey, decisionKey } from './context';
import { ruleChatAnswer } from './fallback';
import type { ChatMessage, ChatState, DecisionSource, GeminiDecision, ResolvedDecision, ValidationLogEntry } from './types';
import { resolveDecisions } from './validate';

export interface GeminiCache {
  generatedAt: string;
  generatedBy: string;
  model: string;
  decisions: Record<string, GeminiDecision[]>;
  chat: Record<string, string>;
}
const CACHE = cache as GeminiCache;
/** A placeholder cache (generated without an API key) holds rule-based texts, so label it honestly. */
const CACHE_SOURCE: DecisionSource = CACHE.generatedBy === 'gemini' ? 'cached' : 'rule';

export interface ApiStatus {
  live: boolean;
  model: string;
}

async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchStatus(): Promise<ApiStatus> {
  try {
    const res = await fetch('/api/status', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as ApiStatus;
  } catch {
    return { live: false, model: CACHE.model };
  }
}

export interface DecisionsResult {
  decisions: Record<string, ResolvedDecision>;
  log: ValidationLogEntry[];
  source: DecisionSource;
  note?: string;
}

export async function getDecisions(c: SimConfig, plan: Plan, live: boolean): Promise<DecisionsResult> {
  const req = buildDecisionRequest(c, plan);
  let note: string | undefined;
  if (live) {
    try {
      const { decisions } = await postJson<{ decisions: GeminiDecision[] }>('/api/decisions', req, 60000);
      return { ...resolveDecisions(c, plan, decisions, 'live'), source: 'live' };
    } catch (e) {
      note = `Live Gemini call failed (${(e as Error).message}); using offline data.`;
    }
  }
  const cached = CACHE.decisions[decisionKey(req)];
  if (cached) return { ...resolveDecisions(c, plan, cached, CACHE_SOURCE), source: CACHE_SOURCE, note };
  return {
    ...resolveDecisions(c, plan, null, 'rule'),
    source: 'rule',
    note: note ?? 'No cached Gemini response for these settings; rule-based texts are shown.',
  };
}

export async function askStadium(
  question: string,
  state: ChatState,
  history: ChatMessage[],
  live: boolean,
): Promise<{ answer: string; source: DecisionSource }> {
  if (live) {
    try {
      const { answer } = await postJson<{ answer: string }>('/api/chat', { question, state, history }, 25000);
      return { answer, source: 'live' };
    } catch {
      /* fall through to offline */
    }
  }
  const hit = CACHE.chat[chatKey(question, state.fanBlock, state.simMinuteAfterWhistle)];
  if (hit) return { answer: hit, source: CACHE_SOURCE };
  return { answer: ruleChatAnswer(question, state), source: 'rule' };
}

export const cacheInfo = { generatedAt: CACHE.generatedAt, generatedBy: CACHE.generatedBy, model: CACHE.model };
