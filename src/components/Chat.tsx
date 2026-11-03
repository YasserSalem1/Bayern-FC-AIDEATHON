import { useEffect, useRef, useState } from 'react';
import { askStadium } from '../gemini/client';
import { PRESET_QUESTIONS } from '../gemini/types';
import { buildChatState } from '../sim/estimates';
import { useStore } from '../store';
import { SourceBadge } from './ui';

/** Builds the grounded state for the current fan block and simulation minute (AI scenario). */
export function useChatState() {
  const { plan, blocks, decisions, results, config, fanBlock } = useStore();
  const t = useStore((s) => Math.floor(s.t));
  if (!plan || !blocks || !results || !fanBlock) return null;
  const bp = plan.blocks.find((b) => b.blockId === fanBlock);
  const block = blocks.find((b) => b.id === fanBlock);
  if (!bp || !block) return null;
  return buildChatState(config, t, bp, block, decisions?.[fanBlock], results.ai);
}

export function Chat({ variant = 'panel' }: { variant?: 'panel' | 'phone' }) {
  const { chat, chatBusy, apiLive, set, noteGemini } = useStore();
  const state = useChatState();
  const [input, setInput] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length, chatBusy]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || !state || chatBusy) return;
    setInput('');
    const history = useStore.getState().chat.map(({ role, text }) => ({ role, text }));
    set({ chat: [...useStore.getState().chat, { role: 'user', text: question }], chatBusy: true });
    const { answer, source } = await askStadium(question, state, history, apiLive);
    noteGemini(source);
    set({ chat: [...useStore.getState().chat, { role: 'assistant', text: answer, source }], chatBusy: false });
  };

  const phone = variant === 'phone';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className={`min-h-0 flex-1 space-y-2 overflow-y-auto ${phone ? 'px-3 py-2' : 'px-4 py-3'}`}>
        {chat.length === 0 && (
          <div className="py-2 text-center text-xs text-ink-3">Ask about your wait, wave or reward.</div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[85%] rounded-[18px] px-3.5 py-2 text-[13px] leading-snug whitespace-pre-wrap ${
                m.role === 'user' ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-fill text-ink'
              }`}
            >
              {m.text}
            </div>
            {m.source && (
              <div className="mt-1 scale-90">
                <SourceBadge source={m.source} />
              </div>
            )}
          </div>
        ))}
        {chatBusy && (
          <div className="flex items-center gap-1 px-1 text-ink-3">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:240ms]" />
          </div>
        )}
      </div>
      <div className={`flex gap-1.5 overflow-x-auto ${phone ? 'px-3 pb-1.5' : 'px-4 pb-2'}`}>
        {PRESET_QUESTIONS.map((q) => (
          <button
            type="button"
            key={q}
            onClick={() => void ask(q)}
            disabled={chatBusy || !state}
            className="shrink-0 rounded-full bg-fill px-3 py-1 text-[11px] font-medium text-ink-2 hover:text-ink disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>
      <form
        className={`flex gap-2 border-t border-black/5 ${phone ? 'px-3 py-2' : 'px-4 py-3'}`}
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          placeholder="Message"
          className="min-w-0 flex-1 rounded-full bg-fill px-4 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand/25"
        />
        <button
          type="submit"
          disabled={!input.trim() || chatBusy || !state}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-40"
          aria-label="Send"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}
