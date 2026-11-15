import { t } from '@/i18n';
import { data } from '@/state/store';
import { prefs } from '@/state/prefs';
import { Banner, Card, EmptyState, PageHeader } from '@/ui/components/Layout';
import { Pagination, paginate } from '@/ui/components/Table';
import { History } from '@/ui/icons';
import { useListQuery } from '@/ui/hooks';
import { ActivityList } from './ActivityItem';

const SCOPES = ['all', 'asset', 'person', 'ticket', 'location', 'system'] as const;

export function ActivityPage() {
  const lq = useListQuery();
  const scope = lq.get('scope') || 'all';
  const q = lq.get('q').trim().toLowerCase();

  const filtered = data.value.activity.filter((e) =>
    (scope === 'all' || e.entityType === scope) &&
    (!q || e.entityLabel.toLowerCase().includes(q) || e.type.includes(q) ||
      Object.values(e.params).some((v) => typeof v === 'string' && v.toLowerCase().includes(q))));
  const pageSize = prefs.value.pageSize;
  const pg = paginate(filtered, Number(lq.get('page')) || 1, pageSize);

  return (
    <>
      <PageHeader title={t('nav.activity')} subtitle={t('activity.subtitle')} />
      <Banner>{t('activity.no_actor_note')}</Banner>
      <Card flush>
        <div class="toolbar">
          <input class="input input--search" type="search" placeholder={t('activity.search')} aria-label={t('activity.search')} value={lq.get('q')} onInput={(e) => lq.set({ q: (e.currentTarget as HTMLInputElement).value || undefined })} />
          <select class="select" aria-label={t('activity.scope')} value={scope} onChange={(e) => lq.set({ scope: (e.currentTarget as HTMLSelectElement).value === 'all' ? undefined : (e.currentTarget as HTMLSelectElement).value })}>
            {SCOPES.map((s) => <option key={s} value={s}>{t(`activity.scope_${s}`)}</option>)}
          </select>
        </div>
        <div style={{ padding: '8px 20px' }}>
          {pg.rows.length ? <ActivityList events={pg.rows} /> : <EmptyState icon={<History size={22} />} title={t('activity.empty')} />}
        </div>
        {filtered.length > 0 && <Pagination page={pg.page} pageSize={pageSize} total={filtered.length} onPage={(p) => lq.set({ page: String(p) })} />}
      </Card>
    </>
  );
}
