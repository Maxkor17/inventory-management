import { fmtNumber } from '@/i18n';

export interface ChartItem { label: string; value: number; href?: string; color?: string }

/** Horizontal bars — good for many categories with long labels. */
export function BarChart({ items }: { items: ChartItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul class="bars">
      {items.map((i) => {
        const inner = (
          <>
            <span class="bar__label" title={i.label}>{i.label}</span>
            <span class="bar__track"><span class="bar__fill" style={{ width: `${(i.value / max) * 100}%` }} /></span>
            <span class="bar__value">{fmtNumber(i.value)}</span>
          </>
        );
        return (
          <li key={i.label}>
            {i.href ? <a class="bar" href={i.href}>{inner}</a> : <div class="bar">{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}

const R = 54;
const C = 2 * Math.PI * R;

/** Donut with a text legend (values are readable without relying on colour). */
export function DonutChart({ items, totalLabel }: { items: ChartItem[]; totalLabel: string }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  let offset = 0;
  return (
    <div class="donut">
      <svg class="donut__svg" viewBox="0 0 140 140" role="img" aria-label={`${totalLabel}: ${total}`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--neutral-soft)" stroke-width="20" />
        {total > 0 && items.filter((i) => i.value > 0).map((i) => {
          const len = (i.value / total) * C;
          const el = (
            <circle
              key={i.label} cx="70" cy="70" r={R} fill="none" stroke={i.color ?? 'var(--primary)'} stroke-width="20"
              stroke-dasharray={`${len} ${C - len}`} stroke-dashoffset={-offset} transform="rotate(-90 70 70)"
            />
          );
          offset += len;
          return el;
        })}
        <text x="70" y="68" text-anchor="middle" class="donut__total">{fmtNumber(total)}</text>
        <text x="70" y="86" text-anchor="middle" class="donut__sub">{totalLabel}</text>
      </svg>
      <ul class="donut__legend">
        {items.map((i) => {
          const inner = (
            <>
              <span class="donut__dot" style={{ background: i.color ?? 'var(--primary)' }} />
              <span>{i.label}</span>
              <span class="donut__count">{fmtNumber(i.value)}</span>
            </>
          );
          return <li key={i.label}>{i.href ? <a href={i.href}>{inner}</a> : <span class="item">{inner}</span>}</li>;
        })}
      </ul>
    </div>
  );
}

/** Vertical columns (time series such as purchases per year). */
export function ColumnChart({ items }: { items: ChartItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div class="columns" role="list">
      {items.map((i) => (
        <div key={i.label} class="columns__col" role="listitem" aria-label={`${i.label}: ${i.value}`}>
          <span class="columns__value">{fmtNumber(i.value)}</span>
          <span class="columns__bar" style={{ height: `${Math.max(2, (i.value / max) * 100)}%` }} />
          <span class="columns__label">{i.label}</span>
        </div>
      ))}
    </div>
  );
}
