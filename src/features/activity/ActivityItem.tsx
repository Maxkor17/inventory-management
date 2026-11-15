import type { ActivityEvent, FieldChange } from '@/domain/types';
import { fullName } from '@/domain/people';
import { fmtDate, fmtDateTime, fmtMoney, t, tc } from '@/i18n';
import type { TKey } from '@/i18n';
import { href } from '@/router/router';
import { assetsById, peopleById } from '@/state/store';

const DATE_FIELDS = new Set(['purchaseDate', 'commissionedDate', 'warrantyEndDate', 'startDate']);

function formatValue(e: ActivityEvent, c: FieldChange, value: string | number | null): string {
  if (value === null || value === '') return '—';
  switch (c.field) {
    case 'status': return e.entityType === 'ticket' ? tc('ticket_status', String(value)) : tc('status', String(value));
    case 'category': return tc('category', String(value));
    case 'priority': return tc('priority', String(value));
    case 'cost': return typeof value === 'number' ? fmtMoney(value) : String(value);
    case 'specialistId': { const p = peopleById.value.get(String(value)); return p ? fullName(p) : '—'; }
    default: return DATE_FIELDS.has(c.field) ? fmtDate(String(value)) : String(value);
  }
}

function eventText(e: ActivityEvent): string {
  const p: Record<string, string | number> = { label: e.entityLabel };
  for (const [k, v] of Object.entries(e.params)) {
    if (v === null) p[k] = k === 'to' || k === 'from' ? t('event.nobody') : t('common.none');
    else if (k === 'reason') p[k] = t(`reason.${v}` as TKey);
    else if (k === 'priority') p[k] = tc('priority', String(v));
    else p[k] = v;
  }
  return t(`event.${e.type}` as TKey, p);
}

function entityLink(e: ActivityEvent): string | null {
  if (e.entityType === 'asset' && assetsById.value.has(e.entityId)) return href(['assets', e.entityId]);
  if (e.entityType === 'person' && peopleById.value.has(e.entityId)) return href(['people', e.entityId]);
  if (e.entityType === 'ticket' && e.assetId && assetsById.value.has(e.assetId)) return href(['assets', e.assetId], { tab: 'maintenance' });
  if (e.entityType === 'location') return href(['locations']);
  return null;
}

export function ActivityItem({ e }: { e: ActivityEvent }) {
  const link = entityLink(e);
  return (
    <li>
      <div class="timeline__body">
        <div>{link ? <a href={link}>{eventText(e)}</a> : eventText(e)}</div>
        {e.changes.length > 0 && (
          <ul class="timeline__changes">
            {e.changes.map((c) => (
              <li key={c.field}>
                <strong>{t(`field.${c.field}` as TKey)}:</strong> <del>{formatValue(e, c, c.from)}</del> → <ins>{formatValue(e, c, c.to)}</ins>
              </li>
            ))}
          </ul>
        )}
      </div>
      <time class="timeline__time" dateTime={e.at}>{fmtDateTime(e.at)}</time>
    </li>
  );
}

export function ActivityList({ events }: { events: readonly ActivityEvent[] }) {
  return <ul class="timeline">{events.map((e) => <ActivityItem key={e.id} e={e} />)}</ul>;
}
