import { signal } from '@preact/signals';
import { t } from '@/i18n';
import { X } from '../icons';

type Kind = 'info' | 'success' | 'error';
interface ToastItem { id: number; kind: Kind; message: string }

const items = signal<ToastItem[]>([]);
let seq = 0;

export function toast(kind: Kind, message: string): void {
  const id = ++seq;
  items.value = [...items.value, { id, kind, message }];
  setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4500);
}

function dismiss(id: number): void {
  items.value = items.value.filter((x) => x.id !== id);
}

export function ToastHost() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {items.value.map((x) => (
        <div key={x.id} class={`toast toast--${x.kind}`}>
          <div class="toast__body">{x.message}</div>
          <button type="button" aria-label={t('common.close')} onClick={() => dismiss(x.id)}><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}
