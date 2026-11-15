import { useEffect, useState } from 'preact/hooks';
import { activityToCsv, peopleToCsv, ticketsToCsv } from '@/domain/csv-export';
import { assetsToCsv } from '@/domain/csv-assets';
import { fmtDateTime, t } from '@/i18n';
import type { TKey } from '@/i18n';
import { buildBackup, parseBackup, restoreBackup, serializeBackup } from '@/services/backup-restore';
import { loadDemoData, removeDemoData } from '@/services/demo';
import { detectLegacySource, getLegacyBackup, getLegacyMigrationRecord } from '@/services/legacy-migration';
import type { LegacyMigrationRecord, LegacySource } from '@/services/legacy-migration';
import { prefs, setPref } from '@/state/prefs';
import type { Theme } from '@/state/prefs';
import { ctx, data, hasDemoData, mutate, refresh } from '@/state/store';
import { Button } from '@/ui/components/Button';
import { errorText } from '@/ui/components/Fields';
import { Banner, Card, PageHeader } from '@/ui/components/Layout';
import { confirmDialog, Modal } from '@/ui/components/Modal';
import { toast } from '@/ui/components/Toast';
import { downloadCsv, downloadText, readFileText, stamp } from '@/ui/download';
import { Archive, Database, Download, FileUp, Upload } from '@/ui/icons';
import { downloadLegacyBackup, LegacyImportFlow } from '../migration/LegacyImportFlow';

function currentLegacySource(): LegacySource | null {
  try { return detectLegacySource(localStorage); } catch { return null; }
}

export function SettingsPage() {
  const p = prefs.value;
  const d = data.value;
  const [record, setRecord] = useState<LegacyMigrationRecord | undefined>();
  const [storedBackup, setStoredBackup] = useState<LegacySource['backups'] | undefined>();
  const [source, setSource] = useState<LegacySource | null>(currentLegacySource());
  const [legacyModal, setLegacyModal] = useState<LegacySource | null>(null);
  const [days, setDays] = useState(String(p.warrantySoonDays));
  const [daysError, setDaysError] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadLegacyState = async (): Promise<void> => {
    setRecord(await getLegacyMigrationRecord(ctx()));
    setStoredBackup((await getLegacyBackup(ctx()))?.raw);
    setSource(currentLegacySource());
  };
  useEffect(() => { void loadLegacyState(); }, []);

  const saveDays = (value: string): void => {
    setDays(value);
    const n = Number(value);
    const valid = Number.isInteger(n) && n >= 1 && n <= 365;
    setDaysError(!valid);
    if (valid) setPref('warrantySoonDays', n);
  };

  const exportBackup = async (): Promise<void> => {
    downloadText(`inventory-backup-${stamp()}.json`, serializeBackup(await buildBackup(ctx())));
    toast('success', t('settings.backup_downloaded'));
  };

  const restore = async (file: File): Promise<void> => {
    const text = await readFileText(file).catch(() => null);
    if (text === null) { toast('error', t('err.file_unreadable')); return; }
    const parsed = parseBackup(text);
    if (!parsed.ok) { toast('error', `${t(`restore.${parsed.error}` as TKey)}${parsed.detail ? ` (${parsed.detail})` : ''}`); return; }
    const { assets, people, locations, tickets } = parsed.value.data;
    const ok = await confirmDialog({
      title: t('restore.confirm_title'),
      message: t('restore.confirm_message', { assets: assets.length, people: people.length, locations: locations.length, tickets: tickets.length }),
      confirmLabel: t('restore.confirm'), danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      // Safety net: the current data is downloaded BEFORE anything is replaced.
      downloadText(`inventory-before-restore-${stamp()}.json`, serializeBackup(await buildBackup(ctx())));
      const r = await mutate(() => restoreBackup(ctx(), text));
      if (r.ok) toast('success', t('restore.done')); else toast('error', t(`restore.${r.errors._form ?? 'invalid_schema'}` as TKey));
    } finally { setBusy(false); }
  };

  const importLegacyFile = async (file: File): Promise<void> => {
    const text = await readFileText(file).catch(() => null);
    if (text === null) { toast('error', t('err.file_unreadable')); return; }
    setLegacyModal({ key: 'file', raw: text, backups: {} });
  };

  const demo = async (on: boolean): Promise<void> => {
    if (on) {
      const r = await mutate(() => loadDemoData(ctx()));
      if (r.ok) toast('success', t('demo.loaded')); else toast('error', errorText(r.errors._form === 'demo_exists' ? 'demo_exists' : 'demo_failed'));
    } else {
      const ok = await confirmDialog({ title: t('demo.remove_title'), message: t('demo.remove_message'), confirmLabel: t('demo.remove'), danger: true });
      if (!ok) return;
      const r = await mutate(() => removeDemoData(ctx()));
      if (r.ok) toast('success', t('demo.removed')); else toast('error', errorText(r.errors._form === 'demo_in_use' ? 'demo_in_use' : r.errors._form));
    }
  };

  const legacyBackups = source?.backups ?? storedBackup;

  return (
    <>
      <PageHeader title={t('nav.settings')} />

      <Card title={t('settings.appearance')}>
        <div class="form-grid">
          <div class="field">
            <span class="field__label">{t('theme.label')}</span>
            <div class="segmented" role="group" aria-label={t('theme.label')} style={{ alignSelf: 'flex-start' }}>
              {(['light', 'system', 'dark'] as Theme[]).map((th) => (
                <button key={th} type="button" aria-pressed={p.theme === th} onClick={() => setPref('theme', th)}>{t(`theme.${th}` as TKey)}</button>
              ))}
            </div>
          </div>
          <div class="field">
            <span class="field__label">{t('lang.label')}</span>
            <div class="segmented" role="group" aria-label={t('lang.label')} style={{ alignSelf: 'flex-start' }}>
              {(['en', 'uk'] as const).map((l) => (
                <button key={l} type="button" aria-pressed={p.lang === l} onClick={() => setPref('lang', l)} lang={l}>{l === 'en' ? 'English' : 'Українська'}</button>
              ))}
            </div>
          </div>
          <div class="field">
            <label class="field__label" for="soon-days">{t('settings.warranty_days')}</label>
            <input id="soon-days" class="input" type="number" min={1} max={365} value={days} aria-invalid={daysError ? 'true' : undefined} onInput={(e) => saveDays((e.currentTarget as HTMLInputElement).value)} data-testid="warranty-days" />
            <span class={daysError ? 'field__error' : 'field__hint'}>{daysError ? t('err.invalid_number') : t('settings.warranty_days_hint')}</span>
          </div>
          <div class="field">
            <label class="field__label" for="currency">{t('settings.currency')}</label>
            <select id="currency" class="select" value={p.currency} onChange={(e) => setPref('currency', (e.currentTarget as HTMLSelectElement).value)}>
              {['USD', 'EUR', 'GBP', 'UAH', 'PLN'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <Card title={t('settings.backup')}>
        <div class="stack">
          <p class="muted">{t('settings.backup_text')}</p>
          <div class="row">
            <Button variant="primary" onClick={() => void exportBackup()} data-testid="export-backup"><Download size={16} /> {t('settings.export_backup')}</Button>
            <label class={`btn btn--secondary ${busy ? 'is-disabled' : ''}`} style={{ cursor: 'pointer' }}>
              <Upload size={16} /> {t('settings.restore_backup')}
              <input type="file" accept="application/json,.json" hidden disabled={busy} data-testid="restore-input"
                onChange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; (e.currentTarget as HTMLInputElement).value = ''; if (f) void restore(f); }} />
            </label>
          </div>
          <h3>{t('settings.csv_exports')}</h3>
          <div class="row">
            <Button onClick={() => downloadCsv(`assets-${stamp()}.csv`, assetsToCsv(d.assets, d.people, d.locations))}>{t('nav.assets')}</Button>
            <Button onClick={() => downloadCsv(`people-${stamp()}.csv`, peopleToCsv(d.people, d.locations, d.assets))}>{t('nav.people')}</Button>
            <Button onClick={() => downloadCsv(`tickets-${stamp()}.csv`, ticketsToCsv(d.tickets, d.assets, d.people))}>{t('nav.maintenance')}</Button>
            <Button onClick={() => downloadCsv(`activity-${stamp()}.csv`, activityToCsv(d.activity))}>{t('nav.activity')}</Button>
          </div>
        </div>
      </Card>

      <Card title={t('settings.legacy')}>
        <div class="stack">
          <p class="muted">{t('settings.legacy_text')}</p>
          {record?.status === 'done' && <Banner tone="success">{t('settings.legacy_done', { date: fmtDateTime(record.at), assets: record.counts?.assets ?? 0 })}</Banner>}
          {record?.status === 'skipped' && <Banner tone="warning">{t('settings.legacy_skipped')}</Banner>}
          {!record && source && <Banner tone="warning">{t('settings.legacy_pending')}</Banner>}
          {!source && !storedBackup && <p class="muted">{t('settings.legacy_none')}</p>}
          <div class="row">
            {source && <Button variant={record?.status === 'done' ? 'secondary' : 'primary'} onClick={() => setLegacyModal(source)} data-testid="legacy-import-ls"><Database size={16} /> {t('settings.legacy_import_ls')}</Button>}
            <label class="btn btn--secondary" style={{ cursor: 'pointer' }}>
              <FileUp size={16} /> {t('settings.legacy_import_file')}
              <input type="file" accept="application/json,.json" hidden data-testid="legacy-file-input"
                onChange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; (e.currentTarget as HTMLInputElement).value = ''; if (f) void importLegacyFile(f); }} />
            </label>
            {legacyBackups && <Button onClick={() => downloadLegacyBackup(legacyBackups)}><Archive size={16} /> {t('migration.download_backup')}</Button>}
            <a class="btn btn--ghost" href="./legacy/v1.1/" target="_blank" rel="noopener">{t('settings.open_legacy')}</a>
          </div>
        </div>
      </Card>

      <Card title={t('settings.demo')}>
        <div class="stack">
          <p class="muted">{t('settings.demo_text')}</p>
          <div class="row">
            {hasDemoData.value
              ? <Button variant="danger" onClick={() => void demo(false)} data-testid="demo-remove">{t('demo.remove')}</Button>
              : <Button onClick={() => void demo(true)} data-testid="demo-load">{t('demo.load')}</Button>}
          </div>
        </div>
      </Card>

      <Card title={t('settings.about')}>
        <div class="stack">
          <p>{t('about.text')}</p>
          <h3>{t('about.limitations')}</h3>
          <ul>
            {(['about.l1', 'about.l2', 'about.l3', 'about.l4', 'about.l5', 'about.l6'] as const).map((k) => <li key={k}>{t(k)}</li>)}
          </ul>
        </div>
      </Card>

      {legacyModal && (
        <Modal title={t('migration.title')} size="wide" onClose={() => setLegacyModal(null)}>
          <LegacyImportFlow
            source={legacyModal} mode="settings"
            onFinish={async (r) => {
              setLegacyModal(null);
              await refresh();
              await loadLegacyState();
              if (r === 'migrated') toast('success', t('migration.done_title'));
            }}
          />
        </Modal>
      )}
    </>
  );
}
