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
    title: 'Everyone leaves at once',
    target: 'panel-left',
    tab: 'simulation',
    left: 'none',
    right: 'ai',
    play: { from: 0, speed: 20 },
    caption: (r) =>
      `75,024 fans, one U6 station. Queue peaks at ${fmt(r.none.summary.peakU6Queue)} — unsafe for ${r.none.summary.minutesAboveSafe} minutes.`,
  },
  {
    title: 'Same tip for all backfires',
    target: 'chart-shuttle',
    tab: 'comparison',
    caption: (r) =>
      `${fmt(r.naive.summary.routeStats.shuttle.users)} fans get the same tip and herd to the shuttle. Worst wait: ${fmt(r.naive.summary.worstWait)} minutes.`,
  },
  {
    title: 'AI exit waves',
    target: 'panel-right',
    tab: 'simulation',
    left: 'none',
    right: 'ai',
    play: { from: 0, speed: 20 },
    caption: (r) =>
      `Each block gets its own time and route. Queue ${fmt(pctChange(r.none.summary.peakU6Queue, r.ai.summary.peakU6Queue))}%, wait ${fmt(
        pctChange(r.none.summary.avgWait, r.ai.summary.avgWait),
      )}%, unsafe minutes ${r.ai.summary.minutesAboveSafe}.`,
  },
  {
    title: 'How Gemini decides',
    target: 'decision-trace',
    tab: 'decisions',
    caption: () => 'The optimizer sets the wave. Gemini picks the reward and writes the message. Every step is traceable.',
  },
  {
    title: 'What the fan sees',
    target: 'phone',
    tab: 'fan',
    caption: () => 'A personal message, a countdown, a reward — and a stadium you can ask anything.',
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
          className="absolute rounded-[26px] ring-2 ring-white/90 transition-all duration-300"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.42)',
          }}
        />
      )}
      <div
        className={`pointer-events-auto absolute ${captionTop ? 'top-20' : 'bottom-6'} left-1/2 w-[640px] max-w-[calc(100vw-48px)] -translate-x-1/2 rounded-[24px] bg-white/90 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl`}
      >
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-ink-3 tabular-nums">
            {pitchStep + 1} / {STEPS.length}
          </div>
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === pitchStep ? 'w-6 bg-brand' : i < pitchStep ? 'w-1.5 bg-brand' : 'w-1.5 bg-fill'}`} />
            ))}
          </div>
        </div>
        <h3 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">{step.title}</h3>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{results ? step.caption(results) : 'Simulation is still running…'}</p>
        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" onClick={() => set({ pitchStep: null, playing: false })}>
            Exit
          </Button>
          <div className="flex gap-2">
            <Button disabled={pitchStep === 0} onClick={() => set({ pitchStep: pitchStep - 1 })}>
              Back
            </Button>
            {pitchStep < STEPS.length - 1 ? (
              <Button variant="primary" onClick={() => set({ pitchStep: pitchStep + 1 })}>
                Next
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
