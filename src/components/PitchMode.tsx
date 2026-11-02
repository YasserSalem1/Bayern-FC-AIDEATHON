import { useEffect, useState } from 'react';
import type { ScenarioId } from '../sim/config';
import type { ScenarioResult } from '../sim/simulate';
import { FAN_DEMO_MINUTE, defaultFanBlock } from '../sim/estimates';
import { useStore, type Tab } from '../store';
import { fmt, pctChange } from './theme';
import { Button } from './ui';

interface PitchStep {
  title: string;
  target: string;
  tab: Tab;
  left?: ScenarioId;
  right?: ScenarioId;
  play?: { from: number; speed: number };
  caption: (r: Record<ScenarioId, ScenarioResult>) => string;
}

const STEPS: PitchStep[] = [
  {
    title: '1 · The problem',
    target: 'panel-left',
    tab: 'simulation',
    left: 'none',
    right: 'ai',
    play: { from: 0, speed: 20 },
    caption: (r) =>
      `At the final whistle 75,024 fans leave at once. Almost everyone heads down the Esplanade to one U6 station: the queue peaks at ${fmt(
        r.none.summary.peakU6Queue,
      )} people, and the station approach is above safe density for ${r.none.summary.minutesAboveSafe} minutes.`,
  },
  {
    title: '2 · Same tip for all makes it worse',
    target: 'chart-shuttle',
    tab: 'comparison',
    caption: (r) =>
      `An app that gives everyone the same "fastest route" tip sees an empty bus stop and sends every user there. ${fmt(r.naive.summary.routeStats.shuttle.users)} fans herd to the shuttle – it becomes the slowest route (${fmt(
        r.naive.summary.routeStats.shuttle.avgTimeToHome,
      )} min to home on average, worst wait ${fmt(r.naive.summary.worstWait)} min).`,
  },
  {
    title: '3 · AI exit waves',
    target: 'panel-right',
    tab: 'simulation',
    left: 'none',
    right: 'ai',
    play: { from: 0, speed: 20 },
    caption: (r) =>
      `Instead, every block gets its own exit wave and route that keeps queues under capacity. Same fans, same seed: peak platform queue ${fmt(
        pctChange(r.none.summary.peakU6Queue, r.ai.summary.peakU6Queue),
      )}%, average wait ${fmt(pctChange(r.none.summary.avgWait, r.ai.summary.avgWait))}%, unsafe minutes ${r.none.summary.minutesAboveSafe} → ${r.ai.summary.minutesAboveSafe} – even though only ${fmt(
        r.ai.summary.compliance * 100,
      )}% of fans follow the advice.`,
  },
  {
    title: '4 · How Gemini decides',
    target: 'decision-trace',
    tab: 'decisions',
    caption: () =>
      'Every decision is traceable: inputs → optimizer wave & route → Gemini picks the incentive that fits the fan mix (café points for families, ticket-lottery entries for fan clubs), explains why, and writes the message. A validator checks it against the reward budget.',
  },
  {
    title: '5 · What the fan sees',
    target: 'phone',
    tab: 'fan',
    caption: () =>
      'Each fan gets a personal message, a countdown to their wave, an honest comparison of home times, a reward for waiting – and can ask the stadium anything. Mia san mia. Nur ned alle auf oamal.',
  },
];

export function PitchMode() {
  const { pitchStep, set, results } = useStore();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = pitchStep === null ? null : STEPS[pitchStep];

  // Apply the step's view state.
  useEffect(() => {
    if (!step) return;
    const patch: Record<string, unknown> = { tab: step.tab, chatOpen: false, simLayout: 'split' };
    if (step.left) patch.left = step.left;
    if (step.right) patch.right = step.right;
    if (step.play) Object.assign(patch, { t: step.play.from, speed: step.play.speed, playing: true });
    else patch.playing = false;
    if (step.tab === 'fan') {
      const { plan, config } = useStore.getState();
      Object.assign(patch, { t: FAN_DEMO_MINUTE, chat: [], fanBlock: plan ? defaultFanBlock(plan, config.rewards.minDelayForIncentiveMin) : undefined });
    }
    set(patch as never);
    const id = window.setTimeout(() => document.querySelector(`[data-pitch="${step.target}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
    return () => window.clearTimeout(id);
  }, [pitchStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track the highlighted element.
  useEffect(() => {
    if (!step) return;
    let raf = 0;
    let last = '';
    const loop = () => {
      const el = document.querySelector(`[data-pitch="${step.target}"]`);
      const r = el?.getBoundingClientRect() ?? null;
      const key = r ? `${r.x|0},${r.y|0},${r.width|0},${r.height|0}` : '';
      if (key !== last) {
        last = key;
        setRect(r);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  // Keyboard navigation.
  useEffect(() => {
    if (pitchStep === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') set({ pitchStep: Math.min(STEPS.length - 1, pitchStep + 1) });
      if (e.key === 'ArrowLeft') set({ pitchStep: Math.max(0, pitchStep - 1) });
      if (e.key === 'Escape') set({ pitchStep: null, playing: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pitchStep, set]);

  if (!step || pitchStep === null) return null;
  const pad = 8;
  const captionTop = !!rect && rect.bottom > window.innerHeight - 260;
  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {rect && (
        <div
          className="absolute rounded-2xl ring-4 ring-brand transition-all duration-300"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.45)',
          }}
        />
      )}
      <div
        className={`pointer-events-auto absolute ${captionTop ? 'top-20' : 'bottom-6'} left-1/2 w-[720px] max-w-[calc(100vw-48px)] -translate-x-1/2 rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200`}
      >
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold tracking-wide text-brand uppercase">
            Pitch mode · step {pitchStep + 1} of {STEPS.length}
          </div>
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 w-6 rounded-full ${i <= pitchStep ? 'bg-brand' : 'bg-slate-200'}`} />
            ))}
          </div>
        </div>
        <h3 className="mt-1 text-lg font-bold text-slate-900">{step.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{results ? step.caption(results) : 'Simulation is still running…'}</p>
        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" onClick={() => set({ pitchStep: null, playing: false })}>
            Exit (Esc)
          </Button>
          <div className="flex gap-2">
            <Button disabled={pitchStep === 0} onClick={() => set({ pitchStep: pitchStep - 1 })}>
              ← Back
            </Button>
            {pitchStep < STEPS.length - 1 ? (
              <Button variant="primary" onClick={() => set({ pitchStep: pitchStep + 1 })}>
                Next →
              </Button>
            ) : (
              <Button variant="primary" onClick={() => set({ pitchStep: null, playing: false })}>
                Finish
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
