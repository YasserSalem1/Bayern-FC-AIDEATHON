import type { IncentiveId, SegmentId } from '../sim/config.ts';

/** Structured JSON Gemini must return for every block (enforced via response schema). */
export interface GeminiDecision {
  blockId: string;
  incentive: IncentiveId;
  incentiveReason: string;
  decisionExplanation: string;
  fanMessage: string;
  language: 'de' | 'en';
}

export const DECISION_JSON_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      blockId: { type: 'string' },
      incentive: { type: 'string', enum: ['store_points', 'partner_cafe_points', 'ticket_lottery_entry', 'none'] },
      incentiveReason: { type: 'string', description: '1-2 sentences: why this incentive fits this group' },
      decisionExplanation: { type: 'string', description: 'Plain-language why this block got this wave and route' },
      fanMessage: { type: 'string', description: 'Short friendly push message to the fan, max 200 characters' },
      language: { type: 'string', enum: ['de', 'en'] },
    },
    required: ['blockId', 'incentive', 'incentiveReason', 'decisionExplanation', 'fanMessage', 'language'],
  },
} as const;

export interface AllowedIncentive {
  id: IncentiveId;
  expectedAcceptancePct: number;
  reward: string;
}

export interface BlockDecisionContext {
  blockId: string;
  isAwayBlock: boolean;
  fans: number;
  publicTransportFans: number;
  carFans: number;
  coachTaxiWalkFans: number;
  segmentMixPct: Partial<Record<SegmentId, number>>;
  waveStartMinAfterWhistle: number;
  waveEndMinAfterWhistle: number;
  waveClock: string;
  route: string;
  priorityRank: number;
  optimizerReasons: string[];
  allowedIncentives: AllowedIncentive[];
  suggestedLanguage: 'de' | 'en';
}

export interface DecisionRequest {
  match: { result: string; weather: string; kickoff: string; finalWhistle: string };
  rules: string[];
  blocks: BlockDecisionContext[];
}

export type DecisionSource = 'live' | 'cached' | 'rule';

export interface ResolvedDecision extends GeminiDecision {
  source: DecisionSource;
  /** Incentive Gemini proposed, if the validator had to replace it. */
  proposedIncentive?: IncentiveId;
  validationNote?: string;
}

export interface ValidationLogEntry {
  blockId: string;
  message: string;
}

/** Everything the chatbot may quote. Numbers outside this object must not be invented. */
export interface ChatState {
  simMinuteAfterWhistle: number;
  clockNow: string;
  finalWhistle: string;
  fanBlock: string;
  assignedRoute: string;
  exitWaveStart: string;
  exitWaveEnd: string;
  minutesUntilWave: number;
  incentive: string;
  rewardOffered: string;
  estimatedHomeIfLeaveNow: string;
  minutesInQueueIfLeaveNow: number;
  estimatedHomeIfLeaveAtWave: string;
  minutesInQueueIfLeaveAtWave: number;
  u6QueueNow: number;
  u6ExpectedWaitMinNow: number;
  esplanadeDensityNow: number;
  esplanadeSafeDensity: number;
  shuttleQueueNow: number;
  shuttleExpectedWaitMinNow: number;
  carParkQueueNow: number;
  fansStillInStadium: number;
  fansHome: number;
  trainEveryMin: number;
  trainCapacity: number;
  match: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export const PRESET_QUESTIONS = [
  'How long will I wait if I leave now?',
  'Why should I wait for my wave?',
  'What do I get for waiting?',
  'Is the U6 crowded right now?',
];
