import { create } from 'zustand';
import { DEFAULT_CONFIG, cloneConfig, type ScenarioId, type SimConfig } from './sim/config';
import type { Plan } from './sim/optimizer';
import type { BlockInfo } from './sim/population';
import type { ScenarioResult } from './sim/simulate';
import { requestPlan, requestRun } from './sim/workerClient';
import { fetchStatus, getDecisions } from './gemini/client';
import type { DecisionSource, ResolvedDecision, ValidationLogEntry } from './gemini/types';

export interface ChatEntry {
  role: 'user' | 'assistant';
  text: string;
  source?: DecisionSource;
}
import { incentivesOf } from './gemini/validate';
import { defaultFanBlock } from './sim/estimates';

export type Tab = 'simulation' | 'comparison' | 'decisions' | 'fan' | 'settings';
export type Phase = 'idle' | 'planning' | 'deciding' | 'simulating' | 'ready' | 'error';

interface State {
  config: SimConfig;
  phase: Phase;
  error?: string;
  plan?: Plan;
  blocks?: BlockInfo[];
  results?: Record<ScenarioId, ScenarioResult>;
  decisions?: Record<string, ResolvedDecision>;
  validationLog: ValidationLogEntry[];
  decisionSource?: DecisionSource;
  decisionNote?: string;
  apiLive: boolean;
  model: string;
  /** Source of the most recent Gemini answer (decisions or chat). */
  lastGeminiSource?: DecisionSource;

  tab: Tab;
  left: ScenarioId;
  right: ScenarioId;
  simLayout: 'split' | 'single';
  selectedBlock?: string;
  fanBlock?: string;
  chatOpen: boolean;
  chat: ChatEntry[];
  chatBusy: boolean;

  t: number;
  playing: boolean;
  speed: number;

  pitchStep: number | null;

  init(): Promise<void>;
  apply(config: SimConfig): Promise<void>;
  set(p: Partial<State>): void;
  setT(t: number): void;
  noteGemini(src: DecisionSource): void;
}

let runToken = 0;

export const useStore = create<State>((set, get) => ({
  config: cloneConfig(DEFAULT_CONFIG),
  phase: 'idle',
  validationLog: [],
  apiLive: false,
  model: '',
  tab: 'simulation',
  left: 'none',
  right: 'ai',
  simLayout: 'split',
  chatOpen: false,
  chat: [],
  chatBusy: false,
  t: 0,
  playing: false,
  speed: 5,
  pitchStep: null,

  async init() {
    const status = await fetchStatus();
    set({ apiLive: status.live, model: status.model });
    await get().apply(get().config);
  },

  async apply(config) {
    const token = ++runToken;
    set({ config, phase: 'planning', error: undefined, playing: false });
    try {
      const { plan, blocks } = await requestPlan(config);
      if (token !== runToken) return;
      set({ plan, blocks, phase: 'deciding' });
      const d = await getDecisions(config, plan, get().apiLive);
      if (token !== runToken) return;
      if (d.log.length) console.info('[validation]', d.log);
      set({
        decisions: d.decisions,
        validationLog: d.log,
        decisionSource: d.source,
        decisionNote: d.note,
        lastGeminiSource: d.source,
        phase: 'simulating',
      });
      const { results } = await requestRun(config, incentivesOf(d.decisions));
      if (token !== runToken) return;
      const first = defaultFanBlock(plan, config.rewards.minDelayForIncentiveMin);
      set((s) => ({
        results,
        phase: 'ready',
        fanBlock: s.fanBlock && plan.blocks.some((b) => b.blockId === s.fanBlock) ? s.fanBlock : first,
        selectedBlock: s.selectedBlock && plan.blocks.some((b) => b.blockId === s.selectedBlock) ? s.selectedBlock : first,
      }));
    } catch (e) {
      if (token === runToken) set({ phase: 'error', error: (e as Error).message });
    }
  },

  set: (p) => set(p),
  setT: (t) => set({ t: Math.max(0, Math.min(get().config.horizonMin, t)) }),
  noteGemini: (src) => set({ lastGeminiSource: src }),
}));

// Expose the store for debugging in development builds only.
if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__store = useStore;
