import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { t } from '@/i18n';
import type { TKey } from '@/i18n';
import { Button } from './Button';
import { X } from '../icons';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  size?: 'narrow' | 'normal' | 'wide';
}

/** Native <dialog>: focus is trapped, Esc closes, focus returns to the opener. */
export function Modal({ title, onClose, children, footer, size = 'normal' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return (
    <dialog
      ref={ref}
      class={`modal ${size === 'wide' ? 'modal--wide' : size === 'narrow' ? 'modal--narrow' : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
    >
      <div class="modal__head">
        <h2 id={titleId}>{title}</h2>
        <Button variant="ghost" iconOnly aria-label={t('common.close')} onClick={onClose}><X size={18} /></Button>
      </div>
      <div class="modal__body">{children}</div>
      {footer && <div class="modal__foot">{footer}</div>}
    </dialog>
  );
}

/* ---------- promise-based confirmation ---------- */
interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}
const pending = signal<{ opts: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => { pending.value = { opts, resolve }; });
}

export function ConfirmHost() {
  const p = pending.value;
  if (!p) return null;
  const done = (ok: boolean): void => { pending.value = null; p.resolve(ok); };
  return (
    <Modal
      title={p.opts.title}
      size="narrow"
      onClose={() => done(false)}
      footer={
        <>
          <Button onClick={() => done(false)}>{t('common.cancel')}</Button>
          <Button variant={p.opts.danger ? 'danger-solid' : 'primary'} onClick={() => done(true)} data-testid="confirm-yes">
            {p.opts.confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <p>{p.opts.message}</p>
    </Modal>
  );
}

export const confirmDelete = (what: string, extra?: TKey): Promise<boolean> =>
  confirmDialog({
    title: t('confirm.delete_title'),
    message: t('confirm.delete_message', { what }) + (extra ? ' ' + t(extra) : ''),
    confirmLabel: t('common.delete'),
    danger: true,
  });
