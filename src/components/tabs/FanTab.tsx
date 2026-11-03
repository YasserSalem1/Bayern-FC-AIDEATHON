import { INCENTIVE_LABEL, ROUTE_LABEL, formatClock, whistleClockMin } from '../../sim/config';
import { incentivePoints } from '../../sim/incentives';
import { estimateTrip, naturalRoute } from '../../sim/estimates';
import { useStore } from '../../store';
import { Chat, useChatState } from '../Chat';
import { Card, PageTitle, SourceBadge } from '../ui';

function Countdown({ waveMin }: { waveMin: number }) {
  const t = useStore((s) => Math.floor(s.t * 6) / 6);
  const left = waveMin - t;
  if (left <= 0) return <div className="text-2xl font-extrabold text-emerald-600">Your wave is open – go now</div>;
  const mm = Math.floor(left);
  const ss = Math.floor((left - mm) * 60);
  return (
    <div className="text-4xl font-extrabold tracking-tight text-slate-900 tabular-nums">
      {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
    </div>
  );
}

function Phone() {
  const { plan, blocks, decisions, results, config, fanBlock } = useStore();
  const t = useStore((s) => Math.floor(s.t));
  if (!plan || !blocks || !results || !fanBlock) return null;
  const bp = plan.blocks.find((b) => b.blockId === fanBlock)!;
  const block = blocks.find((b) => b.id === fanBlock)!;
  const d = decisions?.[fanBlock];
  const whistle = whistleClockMin(config);
  const now = estimateTrip(config, results.ai, block, t, naturalRoute(bp));
  const waveStart = Math.max(bp.waveMin, t);
  const wave = estimateTrip(config, results.ai, block, waveStart, bp.route);
  const points = d ? incentivePoints(config, d.incentive, bp.delayMin) : 0;
  const waitMore = Math.max(0, Math.round(bp.waveMin - t));
  return (
    <div className="relative h-[780px] w-[380px] shrink-0 rounded-[52px] bg-slate-900 p-3 shadow-2xl ring-1 ring-slate-700" data-pitch="phone">
      <div className="absolute top-5 left-1/2 z-10 h-6 w-28 -translate-x-1/2 rounded-full bg-slate-900" />
      <div className="flex h-full flex-col overflow-hidden rounded-[42px] bg-slate-50">
        <div className="flex items-center justify-between px-7 pt-3 pb-1 text-[12px] font-semibold text-slate-900">
          <span className="tabular-nums">{formatClock(whistle + t)}</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-slate-900" />
            <span className="h-2.5 w-5 rounded-sm border border-slate-900" />
          </span>
        </div>
        <div className="flex items-center gap-2 px-5 pt-3 pb-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-[10px] font-extrabold text-white">3H</div>
          <div className="text-sm font-bold text-slate-900">The Third Half</div>
          <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">Block {bp.blockId}</span>
        </div>
        <div className="space-y-2.5 overflow-y-auto px-4 pb-2">
          <div className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-wide text-brand uppercase">Personal message</span>
              <span className="scale-90">
                <SourceBadge source={d?.source} />
              </span>
            </div>
            <p className="mt-1 text-[13px] leading-snug text-slate-800">{d?.fanMessage}</p>
          </div>
          {!bp.isAway && bp.planned && bp.delayMin > 0 ? (
            <div className="rounded-2xl bg-white p-3.5 text-center shadow-sm ring-1 ring-slate-100">
              <div className="text-[11px] font-medium text-slate-500">Your exit wave starts in</div>
              <Countdown waveMin={bp.waveMin} />
              <div className="text-[11px] text-slate-500">
                {formatClock(whistle + bp.waveMin)}–{formatClock(whistle + bp.waveEndMin)} · {ROUTE_LABEL[bp.route]}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-white p-3.5 text-center shadow-sm ring-1 ring-slate-100">
              <div className="text-sm font-semibold text-slate-800">{bp.isAway ? 'Follow the stewards' : 'You can leave now'}</div>
              <div className="text-[11px] text-slate-500">{ROUTE_LABEL[bp.route]}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
              <div className="text-[11px] text-slate-500">Leave now</div>
              <div className="text-lg font-bold text-slate-900 tabular-nums">home {formatClock(whistle + now.home)}</div>
              <div className="text-[10px] text-slate-500">{Math.round(now.queue)} min in the crowd · U6</div>
            </div>
            <div className="rounded-2xl bg-brand-50 p-3 ring-1 ring-brand-100">
              <div className="text-[11px] text-brand">{waitMore > 0 ? `Leave in ${waitMore} min` : 'Leave with wave'}</div>
              <div className="text-lg font-bold text-brand tabular-nums">home {formatClock(whistle + wave.home)}</div>
              <div className="text-[10px] text-brand/80">
                {Math.round(wave.queue)} min in the crowd{points ? ` · +${points} pts` : ''}
              </div>
            </div>
          </div>
          {d && d.incentive !== 'none' && (
            <div className="flex items-center gap-3 rounded-2xl bg-slate-900 p-3 text-white">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-lg">★</div>
              <div>
                <div className="text-[11px] text-white/60">Reward for waiting</div>
                <div className="text-sm font-semibold">
                  {d.incentive === 'ticket_lottery_entry' ? '1 ticket-lottery entry' : `${points} ${INCENTIVE_LABEL[d.incentive].toLowerCase()}`}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="mx-3 mt-1 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100" data-pitch="phone-chat">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-800">Ask the stadium</div>
          <Chat variant="phone" />
        </div>
      </div>
    </div>
  );
}

export function FanTab() {
  const { plan, fanBlock, set, decisions } = useStore();
  const state = useChatState();
  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Fan App"
        subtitle="What one fan sees, live on the shared timeline."
        right={
          <div className="flex items-center gap-3">
            <SourceBadge source={fanBlock ? decisions?.[fanBlock]?.source : undefined} />
            <select
              value={fanBlock}
              onChange={(e) => set({ fanBlock: e.target.value, chat: [] })}
              className="rounded-full bg-fill px-3.5 py-1.5 text-[13px] font-medium outline-none"
              aria-label="Fan block"
            >
              {plan?.blocks.map((b) => (
                <option key={b.blockId} value={b.blockId}>
                  Block {b.blockId}
                  {b.isAway ? ' (away)' : ''}
                </option>
              ))}
            </select>
          </div>
        }
      />
      <div className="flex items-start justify-center gap-10">
        <Phone />
        <Card className="w-[380px]">
          <details>
            <summary className="cursor-pointer px-6 py-5 text-[15px] font-semibold select-none">
              Gemini context
              <span className="ml-2 text-xs font-normal text-ink-3">the only numbers the chat may use</span>
            </summary>
            <pre className="mx-5 mb-5 max-h-[600px] overflow-auto rounded-2xl bg-canvas p-4 text-[11px] leading-relaxed text-ink-2">
              {state ? JSON.stringify(state, null, 2) : '…'}
            </pre>
          </details>
        </Card>
      </div>
    </div>
  );
}
