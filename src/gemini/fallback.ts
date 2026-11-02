/** Rule-based text used when Gemini is unavailable and no cached answer matches. */
import { type IncentiveId, type SimConfig, formatClock, whistleClockMin } from '../sim/config';
import type { BlockPlan } from '../sim/optimizer';
import { rewardText, suggestedLanguage } from './context';
import type { ChatState, GeminiDecision } from './types';

const ROUTE_DE: Record<string, string> = {
  u6North: 'über die Esplanade zur U6',
  u6South: 'über die Esplanade Süd zur U6',
  shuttle: 'mit dem Shuttlebus',
  car: 'zum Parkplatz',
};
const ROUTE_EN: Record<string, string> = {
  u6North: 'via the Esplanade to the U6',
  u6South: 'via the Esplanade Süd lane to the U6',
  shuttle: 'by shuttle bus',
  car: 'to the car park',
};

const REWARD_DE: Record<IncentiveId, (c: SimConfig, d: number) => string> = {
  store_points: (c, d) => `${Math.round(d * c.rewards.pointsPerMinuteWaited)} Store-Punkte`,
  partner_cafe_points: (c) => `${c.rewards.cafePointsPerFan} Punkte im Partner-Café`,
  ticket_lottery_entry: () => 'ein Los für die Ticket-Lotterie',
  none: () => '',
};

const INCENTIVE_WHY: Record<IncentiveId, string> = {
  store_points: 'Store points work across all fan types and scale with the minutes waited.',
  partner_cafe_points: 'Families and visitors value a seat, a warm drink and food while they wait.',
  ticket_lottery_entry: 'Season-ticket holders and fan-club members value a chance at scarce tickets most.',
  none: 'No reward is needed: this block leaves immediately or follows a fixed route.',
};

export function ruleDecision(c: SimConfig, bp: BlockPlan, incentive: IncentiveId): GeminiDecision {
  const lang = suggestedLanguage(bp);
  const whistle = whistleClockMin(c);
  const at = formatClock(whistle + bp.waveMin);
  let fanMessage: string;
  if (bp.isAway) {
    fanMessage =
      lang === 'de'
        ? `Gästefans: Euer Weg führt über die Esplanade Süd zur U6. Bitte den Ordnern folgen – gute Heimreise!`
        : `Away fans: your route is the Esplanade Süd lane to the U6. Please follow the stewards – safe journey home!`;
  } else if (!bp.planned || bp.delayMin < c.rewards.minDelayForIncentiveMin) {
    fanMessage =
      lang === 'de'
        ? `Servus! Du kannst gleich los – nimm ${ROUTE_DE[bp.route]}. Gute Heimfahrt!`
        : `Hi! You can head out now – go ${ROUTE_EN[bp.route]}. Safe trip home!`;
  } else {
    const reward = lang === 'de' ? REWARD_DE[incentive](c, bp.delayMin) : rewardText(c, incentive, bp.delayMin);
    fanMessage =
      lang === 'de'
        ? `Servus! Bleib noch bis ${at} – dann ${ROUTE_DE[bp.route]}, ohne Gedränge.${reward ? ` Dafür gibt's ${reward}.` : ''}`
        : `Hi! Stay until ${at}, then go ${ROUTE_EN[bp.route]} without the crush.${incentive !== 'none' ? ` You'll get ${reward}.` : ''}`;
  }
  const explanation = bp.isAway
    ? `Block ${bp.blockId} is an away block. Its route is fixed (Esplanade Süd lane via Eingang Nord) and it leaves at the whistle; the optimizer books its load first and never re-routes it.`
    : !bp.planned
      ? `No wave up to ${c.optimizer.maxWaveMin} min kept the queues below target, so block ${bp.blockId} leaves naturally.`
      : `Block ${bp.blockId} has priority #${bp.priorityRank}. Earlier slots were already filled by fans who leave on their own, so the optimizer gave it the ${bp.waveMin}–${bp.waveEndMin} min wave ${ROUTE_EN[bp.route]}, where the queue stays under ${
          bp.route === 'shuttle' ? c.optimizer.shuttleQueueTarget : c.optimizer.u6QueueTarget
        } people.`;
  return {
    blockId: bp.blockId,
    incentive,
    incentiveReason: INCENTIVE_WHY[incentive],
    decisionExplanation: explanation,
    fanMessage: fanMessage.slice(0, 200),
    language: lang,
  };
}

/** Offline "Ask the stadium": keyword intents answered strictly from the state numbers. */
export function ruleChatAnswer(question: string, s: ChatState): string {
  const q = question.toLowerCase();
  const has = (...w: string[]) => w.some((x) => q.includes(x));
  if (has('food', 'eat', 'drink', 'beer', 'essen', 'trinken', 'hungry', 'toilet', 'wc')) {
    return s.incentive === 'Partner café points'
      ? `Your reward is ${s.rewardOffered}, so a partner café is a good place to wait until ${s.exitWaveStart}. I'm in offline mode and don't have kiosk or café details – please check the stadium signage or the official app.`
      : `I'm in offline mode and don't have kiosk or café details – please check the stadium signage or the official app. Your exit wave starts at ${s.exitWaveStart}.`;
  }
  if (has('leave now', 'wait if', 'how long', 'wie lange', 'jetzt')) {
    return `If you leave now: home around ${s.estimatedHomeIfLeaveNow}, with about ${s.minutesInQueueIfLeaveNow} min standing in the queue (U6 queue right now: ${s.u6QueueNow.toLocaleString('en')} people). If you leave with your wave at ${s.exitWaveStart}: home around ${s.estimatedHomeIfLeaveAtWave}, with about ${s.minutesInQueueIfLeaveAtWave} min of queueing.`;
  }
  if (has('why', 'warum', 'wave', 'welle')) {
    return `Your block ${s.fanBlock} is scheduled for ${s.exitWaveStart}–${s.exitWaveEnd} via ${s.assignedRoute}. Spreading blocks over waves keeps the Esplanade below ${s.esplanadeSafeDensity} people/m² and the platform queue short. Right now density is ${s.esplanadeDensityNow} people/m².`;
  }
  if (has('reward', 'point', 'punkte', 'lottery', 'what do i get', 'bekomme')) {
    return s.incentive === 'none'
      ? `Your block has no reward because you can leave right away via ${s.assignedRoute}.`
      : `For leaving with your wave at ${s.exitWaveStart} you get ${s.rewardOffered}.`;
  }
  if (has('crowd', 'u6', 'voll', 'busy', 'train', 'zug')) {
    return `Right now ${s.u6QueueNow.toLocaleString('en')} people are queuing for the U6 (about ${s.u6ExpectedWaitMinNow} min wait). Esplanade density: ${s.esplanadeDensityNow} people/m² (safe limit ${s.esplanadeSafeDensity}). A train leaves every ${s.trainEveryMin} min with up to ${s.trainCapacity} people.`;
  }
  if (has('bus', 'shuttle')) {
    return `The shuttle queue is ${s.shuttleQueueNow.toLocaleString('en')} people, about ${s.shuttleExpectedWaitMinNow} min of waiting.`;
  }
  if (has('car', 'park', 'auto')) {
    return `About ${s.carParkQueueNow.toLocaleString('en')} people are currently waiting to drive out of the car parks.`;
  }
  return `I'm running in offline mode and can answer questions about your exit: waiting times, your wave (${s.exitWaveStart}), your route (${s.assignedRoute}) and your reward. ${s.fansStillInStadium.toLocaleString('en')} fans are still in the stadium.`;
}
