import { useEffect } from 'react';
import { ChatWidget } from './components/ChatWidget';
import { Header } from './components/Header';
import { PitchMode } from './components/PitchMode';
import { ComparisonTab } from './components/tabs/ComparisonTab';
import { DecisionsTab } from './components/tabs/DecisionsTab';
import { FanTab } from './components/tabs/FanTab';
import { SettingsTab } from './components/tabs/SettingsTab';
import { SimulationTab } from './components/tabs/SimulationTab';
import { useStore } from './store';

/** Advances the shared timeline: 1× = one simulated minute per second. */
function usePlayback() {
  const playing = useStore((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const s = useStore.getState();
      // rAF timestamps can precede the performance.now() taken at start; never step backwards.
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const next = s.t + dt * s.speed;
      if (next >= s.config.horizonMin) {
        s.set({ t: s.config.horizonMin, playing: false });
        return;
      }
      s.set({ t: next });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}

export default function App() {
  const { tab, init, phase, error } = useStore();
  useEffect(() => {
    void init();
  }, [init]);
  usePlayback();
  return (
    <div className="min-h-full min-w-[1180px]">
      <Header />
      <main className="mx-auto max-w-[1440px] px-8 pt-8 pb-24">
        {phase === 'error' && <div className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand">Simulation failed: {error}</div>}
        <div key={tab} className="animate-fade-in">
          {tab === 'simulation' && <SimulationTab />}
          {tab === 'comparison' && <ComparisonTab />}
          {tab === 'decisions' && <DecisionsTab />}
          {tab === 'fan' && <FanTab />}
          {tab === 'settings' && <SettingsTab />}
        </div>
        <p className="mt-10 text-center text-[11px] text-ink-3">Simulation with assumed parameters for demonstration purposes · Map data © OpenStreetMap contributors</p>
      </main>
      <ChatWidget />
      <PitchMode />
    </div>
  );
}
