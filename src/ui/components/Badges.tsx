import type { AssetStatus, PersonStatus, TicketPriority, TicketStatus } from '@/domain/enums';
import type { WarrantyState } from '@/domain/warranty';
import { t, tc, tn } from '@/i18n';

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'violet' | 'neutral';

export function Badge({ tone, children, plain }: { tone: Tone; children: preact.ComponentChildren; plain?: boolean }) {
  return <span class={`badge badge--${tone} ${plain ? 'badge--plain' : ''}`}>{children}</span>;
}

const ASSET_TONE: Record<AssetStatus, Tone> = {
  in_use: 'success', in_stock: 'info', under_repair: 'warning', retired: 'neutral', reserved: 'violet', lost: 'danger',
};
const TICKET_TONE: Record<TicketStatus, Tone> = {
  open: 'info', in_progress: 'warning', waiting: 'violet', resolved: 'success', closed: 'neutral',
};
const PRIORITY_TONE: Record<TicketPriority, Tone> = { low: 'neutral', medium: 'info', high: 'warning', critical: 'danger' };

export const assetStatusTone = (s: AssetStatus): Tone => ASSET_TONE[s];

export const StatusBadge = ({ status }: { status: AssetStatus }) => <Badge tone={ASSET_TONE[status]}>{tc('status', status)}</Badge>;
export const TicketStatusBadge = ({ status }: { status: TicketStatus }) => <Badge tone={TICKET_TONE[status]}>{tc('ticket_status', status)}</Badge>;
export const PriorityBadge = ({ priority }: { priority: TicketPriority }) => <Badge tone={PRIORITY_TONE[priority]}>{tc('priority', priority)}</Badge>;
export const PersonStatusBadge = ({ status }: { status: PersonStatus }) => <Badge tone={status === 'active' ? 'success' : 'neutral'}>{tc('person_status', status)}</Badge>;

export function WarrantyBadge({ state }: { state: WarrantyState }) {
  switch (state.kind) {
    case 'none': return <span class="faint">{t('warranty.none')}</span>;
    case 'expired': return <Badge tone="danger">{t('warranty.expired')}</Badge>;
    case 'soon': return <Badge tone="warning">{state.days === 0 ? t('warranty.today') : tn('warranty.in_days', state.days)}</Badge>;
    case 'valid': return <Badge tone="success">{t('warranty.valid')}</Badge>;
  }
}
