import { t } from '@/i18n';
import { removeDemoData } from '@/services/demo';
import { ctx, mutate } from '@/state/store';
import { Button } from '@/ui/components/Button';
import { Banner } from '@/ui/components/Layout';
import { confirmDialog } from '@/ui/components/Modal';
import { toast } from '@/ui/components/Toast';
import { errorText } from '@/ui/components/Fields';

/** Shown while any demo record exists, so demo data can never be mistaken for real data. */
export function DemoBanner() {
  const remove = async (): Promise<void> => {
    const ok = await confirmDialog({ title: t('demo.remove_title'), message: t('demo.remove_message'), confirmLabel: t('demo.remove'), danger: true });
    if (!ok) return;
    const r = await mutate(() => removeDemoData(ctx()));
    if (r.ok) toast('success', t('demo.removed'));
    else toast('error', errorText(r.errors._form));
  };
  return (
    <Banner tone="warning" actions={<Button small onClick={() => void remove()} data-testid="remove-demo">{t('demo.remove')}</Button>}>
      <strong>{t('demo.banner_title')}</strong> {t('demo.banner_text')}
    </Banner>
  );
}
