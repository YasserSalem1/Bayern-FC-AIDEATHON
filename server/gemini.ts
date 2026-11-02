/**
 * Server-only Gemini access. The API key is read from the environment here and
 * never sent to the browser. Used by the Vite middleware and by `npm run cache-gemini`.
 */
import { GoogleGenAI } from '@google/genai';
import { DECISION_JSON_SCHEMA, type ChatMessage, type ChatState, type DecisionRequest, type GeminiDecision } from '../src/gemini/types.ts';

export const DEFAULT_MODEL = 'gemini-3.8-flash';

export interface GeminiEnv {
  apiKey?: string;
  model: string;
}

export function readEnv(env: Record<string, string | undefined>): GeminiEnv {
  return { apiKey: env.GEMINI_API_KEY?.trim() || undefined, model: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL };
}

const DECISION_SYSTEM = `You are the decision layer of "The Third Half", an exit load balancer for a 75,000-seat football stadium.
A capacity optimizer has ALREADY fixed each block's exit wave (time slot) and route. You must not change them.
For every block you:
1. choose exactly one incentive from that block's allowedIncentives, based on its fan-segment mix
   (families like café seats; season-ticket holders and fan-club members value ticket-lottery entries;
   international visitors like store points). Prefer the option with the highest expectedAcceptancePct
   unless the mix clearly suggests otherwise.
2. explain in plain language why the block got this wave and route (use optimizerReasons; 1-3 sentences).
3. write a short, friendly push message (max 200 characters) in suggestedLanguage that states the wave time,
   the route and the reward. Bavarian warmth is welcome ("Servus"), no emojis, no invented numbers.
Away blocks and blocks with wave 0 get incentive "none". Return one object per block, same blockIds.`;

const CHAT_SYSTEM = `You are "Ask the stadium", the assistant inside a football club's fan app, helping one fan get home after the match.
Rules:
- For anything about the exit situation (waiting times, queues, crowding, trains, shuttles, car parks, the fan's wave,
  route, reward, home time) use ONLY the numbers in STATE. Never invent or estimate other numbers. If STATE does not
  contain the answer, say you don't have that number.
- You may also answer general questions (stadium, matchday, getting around Munich, food, accessibility, the club) briefly
  and helpfully, but do not invent specific facts like prices, opening hours or phone numbers – point to official info.
- Gently encourage leaving with the assigned wave when relevant, but respect the fan's choice.
- Answer in the language of the question. Max 90 words. Plain text, no markdown.`;

function client(env: GeminiEnv): GoogleGenAI {
  if (!env.apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey: env.apiKey });
}

/** One retry with backoff for rate limits (the free tier allows only a few requests per minute). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/429|RESOURCE_EXHAUSTED|503|UNAVAILABLE/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 4000));
      return fn();
    }
    throw e;
  }
}

export async function generateDecisions(env: GeminiEnv, req: DecisionRequest, timeoutMs = 45000): Promise<GeminiDecision[]> {
  const ai = client(env);
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: env.model,
      contents: `Block contexts (JSON):\n${JSON.stringify(req)}`,
      config: {
        systemInstruction: DECISION_SYSTEM,
        responseMimeType: 'application/json',
        responseJsonSchema: DECISION_JSON_SCHEMA,
        temperature: 0.4,
        abortSignal: AbortSignal.timeout(timeoutMs),
      },
    }),
  );
  const parsed = JSON.parse(res.text ?? '[]') as GeminiDecision[];
  if (!Array.isArray(parsed)) throw new Error('Gemini returned a non-array');
  return parsed;
}

export async function chatAnswer(
  env: GeminiEnv,
  question: string,
  state: ChatState,
  history: ChatMessage[] = [],
  timeoutMs = 20000,
): Promise<string> {
  const ai = client(env);
  const contents = [
    ...history.slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: `STATE (JSON):\n${JSON.stringify(state)}\n\nQUESTION: ${question}` }] },
  ];
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: env.model,
      contents,
      config: { systemInstruction: CHAT_SYSTEM, temperature: 0.3, abortSignal: AbortSignal.timeout(timeoutMs) },
    }),
  );
  const text = res.text?.trim();
  if (!text) throw new Error('Empty Gemini answer');
  return text;
}
