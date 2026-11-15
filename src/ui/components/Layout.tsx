import type { ComponentChildren } from 'preact';
import { href } from '@/router/router';
import { t } from '@/i18n';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ComponentChildren; actions?: ComponentChildren }) {
  return (
    <div class="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p class="page-header__sub">{subtitle}</p>}
      </div>
      {actions && <div class="page-header__actions no-print">{actions}</div>}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { label: string; to?: string[] }[] }) {
  return (
    <nav class="breadcrumb" aria-label={t('common.breadcrumb')}>
      {items.map((it, i) => (
        <>
          {i > 0 && <span aria-hidden="true">/</span>}
          {it.to ? <a href={href(it.to)}>{it.label}</a> : <span aria-current="page">{it.label}</span>}
        </>
      ))}
    </nav>
  );
}

export function Card({ title, actions, children, flush, class: cls }: { title?: string; actions?: ComponentChildren; children: ComponentChildren; flush?: boolean; class?: string }) {
  return (
    <section class={`card ${flush ? 'card--flush' : ''} ${cls ?? ''}`}>
      {(title || actions) && (
        <div class={`card__head ${flush ? 'toolbar' : ''}`}>
          {title && <h2 class="card__title">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, to, tone, note }: { label: string; value: string | number; to?: string; tone?: 'danger' | 'warning'; note?: string }) {
  const body = (
    <>
      <span class="kpi__label">{label}</span>
      <span class="kpi__value">{value}</span>
      {note && <span class="kpi__note">{note}</span>}
    </>
  );
  const cls = `kpi ${tone ? `kpi--${tone}` : ''}`;
  return to ? <a class={cls} href={to}>{body}</a> : <div class={cls}>{body}</div>;
}

export function Banner({ tone, children, actions }: { tone?: 'warning' | 'danger' | 'success'; children: ComponentChildren; actions?: ComponentChildren }) {
  return (
    <div class={`banner ${tone ? `banner--${tone}` : ''}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <div class="banner__text">{children}</div>
      {actions}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ComponentChildren; title: string; text?: string; action?: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="empty__icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Tabs<K extends string>({ tabs, current, onChange }: { tabs: { id: K; label: string; count?: number }[]; current: K; onChange: (id: K) => void }) {
  return (
    <div class="tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={current === tab.id} onClick={() => onChange(tab.id)}>
          {tab.label}{tab.count !== undefined && <span class="tabs__count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function DefinitionList({ items }: { items: { label: string; value: ComponentChildren }[] }) {
  return (
    <dl class="dl">
      {items.map((it) => (
        <>
          <dt>{it.label}</dt>
          <dd>{it.value === '' || it.value === null || it.value === undefined ? <span class="faint">—</span> : it.value}</dd>
        </>
      ))}
    </dl>
  );
}
