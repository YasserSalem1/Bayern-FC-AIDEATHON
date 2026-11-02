import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { INCENTIVE_LABEL, ROUTE_LABEL, SEGMENTS, SEGMENT_LABEL, type SegmentId, formatClock, whistleClockMin } from '../../sim/config';
import { mixAcceptance } from '../../sim/incentives';
import type { BlockPlan } from '../../sim/optimizer';
import { useStore } from '../../store';
import { fmt } from '../theme';
import { Card, CardHeader, SourceBadge } from '../ui';

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
  if (!plan || !decisions) return <div className="text-sm text-slate-400">Planning…</div>;
  const rows = [...plan.blocks].sort((a, b) => a.waveMin - b.waveMin || a.priorityRank - b.priorityRank);
  const sel = plan.blocks.find((b) => b.blockId === selectedBlock) ?? rows[0];
  const stats = results?.ai.blockStats;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">How decisions are made</h2>
          <p className="text-sm text-slate-500">
            The <b>optimizer</b> sets every wave and route under hard capacity limits. <b>Gemini</b> then picks the incentive, explains the decision and writes the fan
            message. A validator checks Gemini's choice against the reward budget.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SourceBadge source={decisionSource} />
        </div>
      </div>
      {decisionNote && <div className="rounded-xl bg-sky-50 px-4 py-2 text-xs text-sky-800 ring-1 ring-sky-100">{decisionNote}</div>}

      <Card>
        <CardHeader
          title="U6 capacity plan per 5-minute slot"
          subtitle={`Grey = booked by fans who won't follow advice + away fans · red = waves planned by the optimizer · dashed = capacity per slot. Queue target: ${fmt(plan.u6QueueTarget)} people.`}
        />
        <div className="px-2 pb-3">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={slots} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid stroke="#EEF2F6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={{ stroke: '#CBD5E1' }} interval={1} />
              <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={48} />
              <Tooltip
                formatter={(v, n) => [fmt(Number(v)), n === 'baseline' ? 'Natural leavers + away' : 'Planned waves']}
                labelFormatter={(l) => `Slot ${l} min (${formatClock(whistle + Number(String(l).slice(1)))})`}
                contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }}
              />
              <Legend formatter={(v: string) => <span className="text-xs text-slate-600">{v === 'baseline' ? 'Natural leavers + away fans' : 'Planned exit waves'}</span>} />
              <ReferenceLine y={slots[0]?.cap} stroke="#0F172A" strokeDasharray="4 4" label={{ value: 'U6 capacity / slot', position: 'insideTopRight', fontSize: 11 }} />
              <Bar dataKey="baseline" stackId="a" fill="#CBD5E1" isAnimationActive={false} />
              <Bar dataKey="planned" stackId="a" fill="#DC052D" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-4">
        <Card data-pitch="decision-table">
          <CardHeader
            title="All 24 blocks"
            subtitle="Click a block to open its decision trace"
            right={
              <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] text-slate-500">
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
                <tr className="text-left text-[11px] tracking-wide text-slate-500 uppercase">
                  <th className="px-2 py-2 font-medium">Block</th>
                  <th className="px-2 py-2 font-medium">Segment mix</th>
                  <th className="px-2 py-2 font-medium">Wave</th>
                  <th className="px-2 py-2 font-medium">Route</th>
                  <th className="px-2 py-2 font-medium">Incentive</th>
                  <th className="px-2 py-2 text-right font-medium">Acceptance</th>
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
                      className={`cursor-pointer border-t border-slate-100 transition-colors ${active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-2 py-2 font-semibold text-slate-900">
                        {bp.blockId}
                        {bp.isAway && <span className="ml-1.5 rounded bg-indigo-50 px-1 text-[10px] font-medium text-indigo-700">away</span>}
                      </td>
                      <td className="px-2 py-2">
                        <MixBar mix={bp.mix} />
                      </td>
                      <td className="px-2 py-2 text-slate-700 tabular-nums">
                        {bp.isAway ? 'at whistle' : `+${bp.waveMin}–${bp.waveEndMin}`}
                        <div className="text-[11px] text-slate-400">{formatClock(whistle + bp.waveMin)}</div>
                      </td>
                      <td className="px-2 py-2 text-slate-700">{routeShort(bp)}</td>
                      <td className="px-2 py-2">
                        <span className="text-slate-800">{INCENTIVE_LABEL[d?.incentive ?? 'none']}</span>
                        {d?.validationNote && <span className="ml-1 text-[10px] font-medium text-amber-700">· corrected</span>}
                      </td>
                      <td className="px-2 py-2 text-right text-slate-700 tabular-nums">
                        {bp.isAway ? 'fixed' : st ? `${Math.round(st.compliance * 100)}%` : '–'}
                        <div className="text-[11px] text-slate-400">planned {Math.round(bp.planningAcceptance * 100)}%</div>
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
        <Card className="p-4">
          <div className="text-xs font-semibold text-slate-700">Validator log ({validationLog.length})</div>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
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
      <div className={`absolute top-0 left-0 grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${accent ? 'bg-brand text-white' : 'bg-slate-900 text-white'}`}>{n}</div>
      <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</div>
      <div className="mt-1.5 text-sm text-slate-700">{children}</div>
    </div>
  );
}

function Trace({ bp }: { bp: BlockPlan }) {
  const { decisions, config } = useStore();
  const d = decisions?.[bp.blockId];
  const whistle = whistleClockMin(config);
  return (
    <Card className="flex flex-col gap-5 p-5" data-pitch="decision-trace">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-slate-500">Decision trace</div>
          <div className="text-xl font-bold text-slate-900">Block {bp.blockId}</div>
        </div>
        <SourceBadge source={d?.source} />
      </div>
      <Step n={1} title="Inputs">
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-slate-500">Fans</div>
            <div className="font-semibold tabular-nums">{fmt(bp.size)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-slate-500">Public transport</div>
            <div className="font-semibold tabular-nums">{fmt(bp.ptUsers)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-slate-500">By car (fixed)</div>
            <div className="font-semibold tabular-nums">{fmt(bp.carUsers)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-slate-500">Coach / taxi / walk</div>
            <div className="font-semibold tabular-nums">{fmt(bp.otherUsers)}</div>
          </div>
        </div>
        <ul className="mt-2 space-y-0.5 text-xs">
          {SEGMENTS.filter((s) => bp.mix[s] > 0).map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: SEGMENT_COLOR[s] }} />
              <span className="w-40 text-slate-600">{SEGMENT_LABEL[s]}</span>
              <span className="font-medium tabular-nums">{Math.round(bp.mix[s] * 100)}%</span>
            </li>
          ))}
        </ul>
      </Step>
      <Step n={2} title="Optimizer output">
        <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white">
          {bp.isAway ? (
            <>Fixed route: {ROUTE_LABEL[bp.route]} · leaves at the whistle</>
          ) : bp.planned ? (
            <>
              Wave <b>+{bp.waveMin}–{bp.waveEndMin} min</b> ({formatClock(whistle + bp.waveMin)}–{formatClock(whistle + bp.waveEndMin)}) via <b>{ROUTE_LABEL[bp.route]}</b>
            </>
          ) : (
            <>No feasible wave – advised to leave naturally</>
          )}
        </div>
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
          {bp.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        {bp.candidates.length > 0 && (
          <table className="mt-2 w-full text-[11px]">
            <tbody>
              {bp.candidates.map((cd, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1 pr-2">{cd.feasible ? '✓' : '✗'}</td>
                  <td className="py-1 pr-2 tabular-nums">
                    +{cd.startMin}–{cd.endMin}
                  </td>
                  <td className="py-1 pr-2">{cd.route === 'shuttle' ? 'Shuttle' : 'U6'}</td>
                  <td className={`py-1 ${cd.feasible ? 'text-slate-600' : 'text-brand'}`}>{cd.feasible ? `cost ${cd.cost} · ${cd.note}` : cd.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Step>
      <Step n={3} title="Gemini: incentive & explanation" accent>
        {d ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand ring-1 ring-brand-100">{INCENTIVE_LABEL[d.incentive]}</span>
              {!bp.isAway && (
                <span className="text-[11px] text-slate-500">
                  expected acceptance {Math.round(mixAcceptance(config, bp.mix, d.incentive) * 100)}% (× {Math.round(config.appAdoption * 100)}% app adoption)
                </span>
              )}
            </div>
            {d.validationNote && (
              <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 ring-1 ring-amber-100">
                Validator: Gemini proposed “{INCENTIVE_LABEL[d.proposedIncentive ?? 'none']}”. {d.validationNote}
              </div>
            )}
            <p className="mt-2 text-xs text-slate-600">
              <b className="text-slate-800">Why this incentive: </b>
              {d.incentiveReason}
            </p>
            <p className="mt-1.5 text-xs text-slate-600">
              <b className="text-slate-800">Why this wave & route: </b>
              {d.decisionExplanation}
            </p>
          </>
        ) : (
          '–'
        )}
      </Step>
      <Step n={4} title="Final fan message">
        <div className="max-w-sm rounded-2xl rounded-tl-sm bg-slate-100 px-3.5 py-2.5 text-sm text-slate-800">{d?.fanMessage}</div>
        <div className="mt-1 text-[11px] text-slate-400">
          {d?.language === 'en' ? 'English' : 'German'} · {d?.fanMessage.length ?? 0}/200 characters
        </div>
      </Step>
    </Card>
  );
}
