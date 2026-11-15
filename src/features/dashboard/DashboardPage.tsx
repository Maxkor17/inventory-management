import { ASSET_STATUSES } from '@/domain/enums';
import type { AssetStatus } from '@/domain/enums';
import { todayISO } from '@/domain/util';
import { fmtDate, fmtNumber, t, tc, tn } from '@/i18n';
import { href } from '@/router/router';
import { countBy, purchasesByYear, warrantyBuckets, activeAssignments } from '@/state/selectors';
import { prefs } from '@/state/prefs';
import { data } from '@/state/store';
import { ButtonLink } from '@/ui/components/Button';
import { assetStatusTone } from '@/ui/components/Badges';
import { BarChart, ColumnChart, DonutChart } from '@/ui/charts/Charts';
import { Card, EmptyState, Kpi, PageHeader } from '@/ui/components/Layout';
import { Package, PackagePlus, UserPlus, Wrench, FileUp } from '@/ui/icons';
import { ActivityList } from '../activity/ActivityItem';
import { daysBetween } from '@/domain/util';

const CATEGORY_LIMIT = 8;
const LOCATION_LIMIT = 6;

export function DashboardPage() {
  const { assets, people, locations, assignments, activity } = data.value;
  const today = todayISO();
  const soonDays = prefs.value.warrantySoonDays;

  if (!assets.length && !people.length) {
    return (
      <>
        <PageHeader title={t('nav.dashboard')} />
        <Card>
          <EmptyState
            icon={<Package size={22} />} title={t('dashboard.empty_title')} text={t('dashboard.empty_text')}
            action={<div class="row">
              <ButtonLink variant="primary" href={href(['assets'], { new: '1' })}><PackagePlus size={16} /> {t('assets.add')}</ButtonLink>
              <ButtonLink href={href(['import'])}><FileUp size={16} /> {t('import.title')}</ButtonLink>
              <ButtonLink href={href(['settings'])}>{t('dashboard.load_demo')}</ButtonLink>
            </div>}
          />
        </Card>
      </>
    );
  }

  const byStatus = countBy(assets, (a) => a.status);
  const count = (s: AssetStatus): number => byStatus.get(s) ?? 0;
  const buckets = warrantyBuckets(assets, today, soonDays);
  const activePeople = people.filter((p) => p.status === 'active').length;

  const categoryItems = [...countBy(assets, (a) => a.category).entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, CATEGORY_LIMIT)
    .map(([c, n]) => ({ label: tc('category', c), value: n, href: href(['assets'], { category: c }) }));

  const locNames = new Map(locations.map((l) => [l.id, l.name]));
  const locCounts = [...countBy(assets, (a) => a.locationId ?? '').entries()].sort((a, b) => b[1] - a[1]);
  const locationItems = locCounts.slice(0, LOCATION_LIMIT).map(([id, n]) => ({
    label: id ? locNames.get(id) ?? '?' : t('common.no_location'), value: n, href: href(['assets'], { location: id || 'none' }),
  }));
  const rest = locCounts.slice(LOCATION_LIMIT).reduce((s, [, n]) => s + n, 0);
  if (rest > 0) locationItems.push({ label: t('dashboard.other'), value: rest, href: href(['assets']) });

  const statusItems = ASSET_STATUSES.map((s) => ({
    label: tc('status', s), value: count(s), color: `var(--${assetStatusTone(s)})`, href: href(['assets'], { status: s }),
  }));
  const years = purchasesByYear(assets).map((y) => ({ label: y.year, value: y.count }));

  const warrantyRow = (a: (typeof assets)[number], kind: 'expired' | 'soon') => {
    const d = daysBetween(today, a.warrantyEndDate);
    return (
      <li key={a.id} class="row row--between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
        <a href={href(['assets', a.id])} class="truncate"><strong>{a.inventoryNumber}</strong> · {a.name}</a>
        <span class={kind === 'expired' ? 'nowrap' : 'nowrap'} style={{ color: kind === 'expired' ? 'var(--danger)' : 'var(--warning)' }}>
          {fmtDate(a.warrantyEndDate)} · {d < 0 ? tn('dashboard.days_ago', -d) : d === 0 ? t('warranty.today') : tn('dashboard.in_days', d)}
        </span>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title={t('nav.dashboard')} subtitle={t('dashboard.subtitle')}
        actions={<>
          <ButtonLink variant="primary" href={href(['assets'], { new: '1' })}><PackagePlus size={16} /> {t('assets.add')}</ButtonLink>
          <ButtonLink href={href(['people'], { new: '1' })}><UserPlus size={16} /> {t('people.add')}</ButtonLink>
          <ButtonLink href={href(['maintenance'], { new: '1' })}><Wrench size={16} /> {t('maintenance.new')}</ButtonLink>
        </>}
      />

      <div class="grid grid--kpi" data-testid="kpis">
        <Kpi label={t('dashboard.total_assets')} value={fmtNumber(assets.length)} to={href(['assets'])} />
        <Kpi label={tc('status', 'in_use')} value={fmtNumber(count('in_use'))} to={href(['assets'], { status: 'in_use' })} />
        <Kpi label={tc('status', 'in_stock')} value={fmtNumber(count('in_stock'))} to={href(['assets'], { status: 'in_stock' })} />
        <Kpi label={tc('status', 'under_repair')} value={fmtNumber(count('under_repair'))} to={href(['assets'], { status: 'under_repair' })} />
        <Kpi label={tc('status', 'retired')} value={fmtNumber(count('retired'))} to={href(['assets'], { status: 'retired' })} />
        <Kpi label={t('dashboard.people')} value={fmtNumber(activePeople)} to={href(['people'])} note={t('dashboard.people_total', { total: people.length })} />
        <Kpi label={t('dashboard.active_assignments')} value={fmtNumber(activeAssignments(assignments).length)} />
        <Kpi label={t('dashboard.warranty_soon', { days: soonDays })} value={fmtNumber(buckets.soon.length)} tone={buckets.soon.length ? 'warning' : undefined} to={href(['assets'], { warranty: 'soon' })} />
        <Kpi label={t('dashboard.warranty_expired')} value={fmtNumber(buckets.expired.length)} tone={buckets.expired.length ? 'danger' : undefined} to={href(['assets'], { warranty: 'expired' })} />
      </div>

      <div class="grid grid--2">
        <Card title={t('dashboard.by_category')}>{categoryItems.length ? <BarChart items={categoryItems} /> : <p class="muted">{t('dashboard.no_data')}</p>}</Card>
        <Card title={t('dashboard.by_status')}><DonutChart items={statusItems} totalLabel={t('dashboard.assets_word')} /></Card>
        <Card title={t('dashboard.by_location')}>{locationItems.length ? <BarChart items={locationItems} /> : <p class="muted">{t('dashboard.no_data')}</p>}</Card>
        <Card title={t('dashboard.by_year')}>{years.length ? <ColumnChart items={years} /> : <p class="muted">{t('dashboard.no_purchase_dates')}</p>}</Card>
      </div>

      <div class="grid grid--2">
        <Card title={t('dashboard.expiring_title')} actions={buckets.soon.length > 5 ? <a href={href(['assets'], { warranty: 'soon' })}>{t('common.view_all')}</a> : undefined}>
          {buckets.soon.length ? <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{buckets.soon.slice(0, 5).map((a) => warrantyRow(a, 'soon'))}</ul> : <p class="muted">{t('dashboard.nothing_expiring')}</p>}
        </Card>
        <Card title={t('dashboard.expired_title')} actions={buckets.expired.length > 5 ? <a href={href(['assets'], { warranty: 'expired' })}>{t('common.view_all')}</a> : undefined}>
          {buckets.expired.length ? <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{buckets.expired.slice(0, 5).map((a) => warrantyRow(a, 'expired'))}</ul> : <p class="muted">{t('dashboard.nothing_expired')}</p>}
        </Card>
      </div>

      <Card title={t('dashboard.recent_activity')} actions={<a href={href(['activity'])}>{t('common.view_all')}</a>}>
        {activity.length ? <ActivityList events={activity.slice(0, 8)} /> : <p class="muted">{t('activity.empty')}</p>}
      </Card>
    </>
  );
}
