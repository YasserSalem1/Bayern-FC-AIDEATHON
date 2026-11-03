import type { ReactNode } from 'react';

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string; 'data-pitch'?: string }) {
  return (
    <div className={`rounded-[22px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_28px_rgba(0,0,0,0.05)] ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-2">
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-[32px] leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-[15px] text-ink-2">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function AssumptionBadge() {
  return (
    <span title="Assumption" className="rounded-full bg-amber-100/70 px-1.5 py-px text-[9px] font-semibold tracking-wide text-amber-700 uppercase">
      assumption
    </span>
  );
}

export function SourceBadge({ source }: { source?: 'live' | 'cached' | 'rule' }) {
  if (!source) return null;
  const map = {
    live: ['Gemini', 'bg-emerald-50 text-emerald-700'],
    cached: ['Gemini · cached', 'bg-sky-50 text-sky-700'],
    rule: ['Offline', 'bg-fill text-ink-2'],
  } as const;
  const [text, cls] = map[source];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{text}</span>;
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  className = '',
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]';
  const v = {
    primary: 'bg-brand text-white hover:bg-brand-dark',
    secondary: 'bg-fill text-ink hover:bg-[#dedee3]',
    ghost: 'text-ink-2 hover:text-ink',
  }[variant];
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={`${base} ${v} ${className}`}>
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex rounded-full bg-fill p-0.5">
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`rounded-full font-medium whitespace-nowrap transition-all ${size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3.5 py-1 text-[13px]'} ${
            o.value === value ? 'bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'neutral' }) {
  const toneCls = tone === 'bad' ? 'text-brand' : tone === 'good' ? 'text-emerald-600' : 'text-ink';
  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-ink-3">{label}</div>
      <div className={`text-[22px] leading-tight font-semibold tracking-tight tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="truncate text-[11px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function Spinner() {
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-fill border-t-brand" />;
}
