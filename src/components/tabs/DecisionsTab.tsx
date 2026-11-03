import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { INCENTIVE_LABEL, ROUTE_LABEL, SEGMENTS, SEGMENT_LABEL, type SegmentId, formatClock, whistleClockMin } from '../../sim/config';
import { mixAcceptance } from '../../sim/incentives';
import type { BlockPlan } from '../../sim/optimizer';
import { useStore } from '../../store';
import { fmt } from '../theme';
import { Card, CardHeader, PageTitle, SourceBadge } from '../ui';

export const SEGMENT_COLOR: Record<SegmentId, string> = {
  families: '#2a78d6',
  international: '#eb6834',
  seasonTicket: '#1baf7a',
  fanClub: '#eda100',
  away: '#e87ba4',
};

function MixBar({ mix }: { mix: Record<SegmentId, number> }) {
  return (
    <div className="flex h-2.5 w-28 gap-[2px] overflow-hidden rounded-full">
      {SEGMENTS.filter((s) => (mix[s] ?? 0) > 0.005).map((s) => (
        <div key={s} title={`${SEGMENT_LABEL[s]} ${Math.round(mix[s] * 100)}%`} style={{ width: `${mix[s] * 100}%`, background: SEGMENT_COLOR[s] }} />
      ))}
    </div>
  );
}

function routeShort(bp: BlockPlan) {
  if (bp.route === 'u6South') return 'Esplanade Süd → U6';
  if (bp.route === 'shuttle') return 'Shuttle bus';
  return 'Esplanade → U6';
}

export function DecisionsTab() {
  const { plan, decisions, results, config, selectedBlock, set, decisionSource, decisionNote, validationLog } = useStore();
  const whistle = whistleClockMin(config);
  const slots = useMemo(
    () =>
      plan?.slots
        .filter((s) => s.startMin <= config.optimizer.maxWaveMin + 30)
        .map((s) => ({ name: `+${s.startMin}`, baseline: s.u6Baseline, planned: s.u6Planned, cap: s.u6Cap, queue: s.u6Queue })) ?? [],
    [plan, config.optimizer.maxWaveMin],
  );
  if (!plan || !decisions) return <div className="text-sm text-ink-3">Planning…</div>;
  const rows = [...plan.blocks].sort((a, b) => a.waveMin - b.waveMin || a.priorityRank - b.priorityRank);
  const sel = plan.blocks.find((b) => b.blockId === selectedBlock) ?? rows[0];
  const stats = results?.ai.blockStats;
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="AI Decisions" subtitle="Optimizer sets wave and route. Gemini picks the reward and writes the message." right={<SourceBadge source={decisionSource} />} />
      {decisionNote && <div className="text-xs text-ink-3">{decisionNote}</div>}

      <Card>
        <CardHeader title="U6 capacity plan" subtitle="Per 5-minute slot" />
        <div className="px-3 pb-4">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={slots} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid stroke="#F0F0F2" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#86868B' }} tickLine={false} axisLine={false} interval={1} />
              <YAxis tick={{ fontSize: 11, fill: '#86868B' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                formatter={(v, n) => [fmt(Number(v)), n === 'baseline' ? 'Natural leavers + away' : 'Planned waves']}
                labelFormatter={(l) => `Slot ${l} min (${formatClock(whistle + Number(String(l).slice(1)))})`}
                contentStyle={{ borderRadius: 14, border: 'none', boxShadow: '0 8px 28px rgba(0,0,0,0.12)', fontSize: 12 }}
              />
              <Legend formatter={(v: string) => <span className="text-xs text-ink-2">{v === 'baseline' ? 'Booked (non-followers + away)' : 'Planned waves'}</span>} />
              <ReferenceLine y={slots[0]?.cap} stroke="#1D1D1F" strokeDasharray="3 4" label={{ value: 'capacity', position: 'insideTopRight', fontSize: 11, fill: '#6E6E73' }} />
              <Bar dataKey="baseline" stackId="a" fill="#D2D2D7" isAnimationActive={false} />
              <Bar dataKey="planned" stackId="a" fill="#DC052D" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-5">
        <Card data-pitch="decision-table">
          <CardHeader
            title="24 blocks"
            subtitle="Select a block"
            right={
              <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] text-ink-3">
                {SEGMENTS.map((s) => (
                  <span key={s} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm" style={{ background: SEGMENT_COLOR[s] }} />
                    {SEGMENT_LABEL[s]}
                  </span>
                ))}
              </div>
            }
          />
          <div className="max-h-[560px] overflow-auto px-3 pb-3">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-xs text-ink-3">
                  <th className="px-2 py-2 font-medium">Block</th>
                  <th className="px-2 py-2 font-medium">Mix</th>
                  <th className="px-2 py-2 font-medium">Wave</th>
                  <th className="px-2 py-2 font-medium">Route</th>
                  <th className="px-2 py-2 font-medium">Reward</th>
                  <th className="px-2 py-2 text-right font-medium">Follow</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((bp) => {
                  const d = decisions[bp.blockId];
                  const st = stats?.[bp.index];
                  const active = sel.blockId === bp.blockId;
                  return (
                    <tr
                      key={bp.blockId}
                      onClick={() => set({ selectedBlock: bp.blockId })}
                      className={`cursor-pointer border-t border-black/5 transition-colors ${active ? 'bg-brand-50' : 'hover:bg-fill'}`}
                    >
                      <td className="px-2 py-2 font-semibold text-ink">
                        {bp.blockId}
                        {bp.isAway && <span className="ml-1.5 rounded bg-indigo-50 px-1 text-[10px] font-medium text-indigo-700">away</span>}
                      </td>
                      <td className="px-2 py-2">
                        <MixBar mix={bp.mix} />
                      </td>
                      <td className="px-2 py-2 text-ink-2 tabular-nums">
                        {bp.isAway ? 'at whistle' : `+${bp.waveMin}–${bp.waveEndMin}`}
                        <div className="text-[11px] text-ink-3">{formatClock(whistle + bp.waveMin)}</div>
                      </td>
                      <td className="px-2 py-2 text-ink-2">{routeShort(bp)}</td>
                      <td className="px-2 py-2">
                        <span className="text-ink">{INCENTIVE_LABEL[d?.incentive ?? 'none']}</span>
                        {d?.validationNote && <span className="ml-1 text-[10px] font-medium text-amber-700">· corrected</span>}
                      </td>
                      <td className="px-2 py-2 text-right text-ink-2 tabular-nums">
                        {bp.isAway ? 'fixed' : st ? `${Math.round(st.compliance * 100)}%` : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Trace bp={sel} />
      </div>

      {validationLog.length > 0 && (
        <Card className="p-5">
          <div className="text-xs font-semibold text-ink-2">Validator corrections ({validationLog.length})</div>
          <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
            {validationLog.map((l, i) => (
              <li key={i}>
                <b>{l.blockId}</b>: {l.message}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Step({ n, title, children, accent }: { n: number; title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className="relative pl-9">
      <div className={`absolute top-0 left-0 grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${accent ? 'bg-brand text-white' : 'bg-ink text-white'}`}>{n}</div>
      <div className="text-[13px] font-semibold text-ink">{title}</div>
      <div className="mt-1.5 text-sm text-ink-2">{children}</div>
    </div>
  );
}

function Trace({ bp }: { bp: BlockPlan }) {
  const { decisions, config } = useStore();
  const d = decisions?.[bp.blockId];
  const whistle = whistleClockMin(config);
  return (
    <Card className="flex flex-col gap-5 p-6" data-pitch="decision-trace">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-ink-3">Decision trace</div>
          <div className="text-2xl font-semibold tracking-tight text-ink">Block {bp.blockId}</div>
        </div>
        <SourceBadge source={d?.source} />
      </div>
      <Step n={1} title="Block">
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg bg-canvas p-2">
            <div className="text-ink-3">Fans</div>
            <div className="font-semibold tabular-nums">{fmt(bp.size)}</div>
          </div>
          <div className="rounded-xl bg-canvas p-2.5">
            <div className="text-ink-3">U6 / shuttle</div>
            <div className="font-semibold tabular-nums">{fmt(bp.ptUsers)}</div>
          </div>
          <div className="rounded-xl bg-canvas p-2.5">
            <div className="text-ink-3">Car</div>
            <div className="font-semibold tabular-nums">{fmt(bp.carUsers)}</div>
          </div>
          <div className="rounded-xl bg-canvas p-2.5">
            <div className="text-ink-3">Coach / other</div>
            <div className="font-semibold tabular-nums">{fmt(bp.otherUsers)}</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
          {SEGMENTS.filter((s) => bp.mix[s] > 0).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: SEGMENT_COLOR[s] }} />
              {SEGMENT_LABEL[s]} <span className="font-medium text-ink tabular-nums">{Math.round(bp.mix[s] * 100)}%</span>
            </span>
          ))}
        </div>
      </Step>
      <Step n={2} title="Optimizer">
        <div className="rounded-xl bg-ink px-3.5 py-2.5 text-xs text-white">
          {bp.isAway ? (
            <>Fixed: {ROUTE_LABEL[bp.route]} · at the whistle</>
          ) : bp.planned ? (
            <>
              <b>{formatClock(whistle + bp.waveMin)}–{formatClock(whistle + bp.waveEndMin)}</b> · {ROUTE_LABEL[bp.route]}
            </>
          ) : (
            <>No free slot – leaves naturally</>
          )}
        </div>
        <details className="mt-2 text-xs text-ink-2">
          <summary className="cursor-pointer text-ink-3 select-none hover:text-ink">Why</summary>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {bp.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        {bp.candidates.length > 0 && (
          <table className="mt-2 w-full text-[11px]">
            <tbody>
              {bp.candidates.map((cd, i) => (
                <tr key={i} className="border-t border-black/5">
                  <td className="py-1 pr-2">{cd.feasible ? '✓' : '✗'}</td>
                  <td className="py-1 pr-2 tabular-nums">
                    +{cd.startMin}–{cd.endMin}
                  </td>
                  <td className="py-1 pr-2">{cd.route === 'shuttle' ? 'Shuttle' : 'U6'}</td>
                  <td className={`py-1 ${cd.feasible ? 'text-ink-2' : 'text-brand'}`}>{cd.feasible ? `cost ${cd.cost} · ${cd.note}` : cd.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </details>
      </Step>
      <Step n={3} title="Gemini" accent>
        {d ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand">{INCENTIVE_LABEL[d.incentive]}</span>
              {!bp.isAway && <span className="text-[11px] text-ink-3">{Math.round(mixAcceptance(config, bp.mix, d.incentive) * 100)}% expected to accept</span>}
            </div>
            {d.validationNote && (
              <div className="mt-2 rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                Corrected from “{INCENTIVE_LABEL[d.proposedIncentive ?? 'none']}” — {d.validationNote}
              </div>
            )}
            <p className="mt-2 text-xs text-ink-2">
              <b className="text-ink">Reward · </b>
              {d.incentiveReason}
            </p>
            <p className="mt-1.5 text-xs text-ink-2">
              <b className="text-ink">Wave · </b>
              {d.decisionExplanation}
            </p>
          </>
        ) : (
          '–'
        )}
      </Step>
      <Step n={4} title="Message">
        <div className="max-w-sm rounded-[18px] rounded-tl-md bg-fill px-3.5 py-2.5 text-[13px] text-ink">{d?.fanMessage}</div>
      </Step>
    </Card>
  );
}
