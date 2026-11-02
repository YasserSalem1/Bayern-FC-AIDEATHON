import { useStore } from '../store';
import { Chat } from './Chat';

/** Floating "Ask the stadium" assistant, available on every tab (the Fan App tab embeds it in the phone). */
export function ChatWidget() {
  const { chatOpen, set, tab, fanBlock, plan } = useStore();
  if (tab === 'fan') return null;
  return (
    <div className="fixed right-6 bottom-6 z-40 flex flex-col items-end gap-3" data-pitch="chat-widget">
      {chatOpen && (
        <div className="animate-fade-in flex h-[520px] w-[380px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Ask the stadium</div>
              <div className="text-[11px] text-slate-500">Gemini · answering as a fan in block</div>
            </div>
            <select
              value={fanBlock}
              onChange={(e) => set({ fanBlock: e.target.value })}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              aria-label="Fan block"
            >
              {plan?.blocks.map((b) => (
                <option key={b.blockId} value={b.blockId}>
                  {b.blockId}
                  {b.isAway ? ' (away)' : ''}
                </option>
              ))}
            </select>
          </div>
          <Chat />
        </div>
      )}
      <button
        type="button"
        onClick={() => set({ chatOpen: !chatOpen })}
        className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-slate-800"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
        {chatOpen ? 'Close' : 'Ask the stadium'}
      </button>
    </div>
  );
}
