/**
 * Generates src/data/gemini-cache.json for the default scenario so the demo works offline.
 *
 *   npm run cache-gemini                 → real Gemini calls (needs GEMINI_API_KEY in .env)
 *   npm run cache-gemini -- --placeholder → rule-based texts, no API calls
 *
 * Calls are made one after another with a pause in between to stay inside free-tier rate limits.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { chatAnswer, generateDecisions, readEnv } from '../server/gemini';
import { buildDecisionRequest, chatKey, decisionKey } from '../src/gemini/context';
import { ruleChatAnswer, ruleDecision } from '../src/gemini/fallback';
import { PRESET_QUESTIONS, type GeminiDecision } from '../src/gemini/types';
import { incentivesOf, resolveDecisions } from '../src/gemini/validate';
import { DEFAULT_CONFIG } from '../src/sim/config';
import { FAN_DEMO_MINUTE, buildChatState, defaultFanBlock } from '../src/sim/estimates';
import { planFor, ruleIncentives, runScenarios } from '../src/sim/pipeline';

const placeholder = process.argv.includes('--placeholder');
if (existsSync('.env')) process.loadEnvFile('.env');
const env = readEnv(process.env);
if (!placeholder && !env.apiKey) {
  console.error('GEMINI_API_KEY is not set. Add it to .env, or run with --placeholder for rule-based texts.');
  process.exit(1);
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const c = DEFAULT_CONFIG;
  const planned = planFor(c);
  const req = buildDecisionRequest(c, planned.plan);

  let decisions: GeminiDecision[];
  if (placeholder) {
    const inc = ruleIncentives(c, planned.plan);
    decisions = planned.plan.blocks.map((bp) => ruleDecision(c, bp, inc[bp.blockId]));
  } else {
    console.log(`Requesting 24 block decisions from ${env.model}…`);
    decisions = await generateDecisions(env, req);
  }
  const resolved = resolveDecisions(c, planned.plan, decisions, placeholder ? 'rule' : 'cached');
  if (resolved.log.length) console.log('Validator corrections:', resolved.log);

  const results = runScenarios(c, planned, incentivesOf(resolved.decisions), ['ai']);
  const fanBlock = defaultFanBlock(planned.plan, c.rewards.minDelayForIncentiveMin)!;
  const bp = planned.plan.blocks.find((b) => b.blockId === fanBlock)!;
  const block = planned.pop.blocks.find((b) => b.id === fanBlock)!;
  const state = buildChatState(c, FAN_DEMO_MINUTE, bp, block, resolved.decisions[fanBlock], results.ai);

  const chat: Record<string, string> = {};
  for (const q of PRESET_QUESTIONS) {
    if (placeholder) chat[chatKey(q, fanBlock, FAN_DEMO_MINUTE)] = ruleChatAnswer(q, state);
    else {
      await pause(4500);
      console.log('Chat:', q);
      chat[chatKey(q, fanBlock, FAN_DEMO_MINUTE)] = await chatAnswer(env, q, state);
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    generatedBy: placeholder ? 'rule-based-placeholder' : 'gemini',
    model: placeholder ? 'none' : env.model,
    decisions: { [decisionKey(req)]: decisions },
    chat,
  };
  writeFileSync(new URL('../src/data/gemini-cache.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote src/data/gemini-cache.json (${decisions.length} decisions, ${Object.keys(chat).length} chat answers, fan block ${fanBlock}).`);
}

main().catch((e) => {
  console.error('Failed:', (e as Error).message);
  process.exit(1);
});
