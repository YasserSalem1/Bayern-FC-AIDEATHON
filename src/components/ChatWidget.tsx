import { useStore } from '../store';
import { Chat } from './Chat';

/** Floating "Ask the stadium" assistant, available on every tab (the Fan App tab embeds it in the phone). */
export function ChatWidget() {
  const { chatOpen, set, tab, fanBlock, plan } = useStore();
  if (tab === 'fan') return null;
  return (
    <div className="fixed right-6 bottom-6 z-40 flex flex-col items-end gap-3" data-pitch="chat-widget">
      {chatOpen && (
        <div className="animate-fade-in flex h-[520px] w-[370px] flex-col overflow-hidden rounded-[24px] bg-white/90 shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div className="text-[15px] font-semibold">Ask the stadium</div>
            <select
              value={fanBlock}
              onChange={(e) => set({ fanBlock: e.target.value })}
              className="rounded-full bg-fill px-3 py-1 text-xs font-medium outline-none"
              aria-label="Fan block"
            >
              {plan?.blocks.map((b) => (
                <option key={b.blockId} value={b.blockId}>
                  Block {b.blockId}
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
        aria-label={chatOpen ? 'Close chat' : 'Ask the stadium'}
        title="Ask the stadium"
        className="grid h-12 w-12 place-items-center rounded-full bg-ink text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-transform hover:scale-105 active:scale-95"
      >
        {chatOpen ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
        )}
      </button>
    </div>
  );
}
