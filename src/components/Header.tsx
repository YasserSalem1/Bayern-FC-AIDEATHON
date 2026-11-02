import { useStore } from '../store';
import { Button, Spinner } from './ui';

const PHASE_TEXT = {
  idle: 'Starting…',
  planning: 'Optimizer planning exit waves…',
  deciding: 'Gemini reviewing 24 block decisions…',
  simulating: 'Simulating 75,024 fans × 3 scenarios…',
  ready: '',
  error: 'Error',
} as const;

export function Header() {
  const { phase, apiLive, lastGeminiSource, model, set, pitchStep } = useStore();
  const live = apiLive && lastGeminiSource === 'live';
  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-sm font-extrabold text-white shadow-sm">3H</div>
        <div>
          <h1 className="text-lg leading-tight font-bold tracking-tight text-slate-900">The Third Half</h1>
          <p className="text-xs text-slate-500 italic">Mia san mia. Nur ned alle auf oamal.</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {phase !== 'ready' && (
          <span className="flex items-center gap-2 text-xs text-slate-500">
            {phase !== 'error' && <Spinner />}
            {PHASE_TEXT[phase]}
          </span>
        )}
        <span
          title={
            live
              ? `Live calls to ${model}`
              : apiLive
                ? 'Key configured, but the last call fell back to offline data'
                : 'No GEMINI_API_KEY – using cached Gemini responses and rule-based fallback'
          }
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
            live ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          Gemini: {live ? 'Live' : 'Cached'}
        </span>
        <Button variant="primary" onClick={() => set({ pitchStep: pitchStep === null ? 0 : null })}>
          {pitchStep === null ? '▶ Pitch Mode' : 'Exit Pitch Mode'}
        </Button>
      </div>
    </header>
  );
}
