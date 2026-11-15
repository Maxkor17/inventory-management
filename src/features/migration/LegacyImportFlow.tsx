import { useEffect, useState } from 'preact/hooks';
import { LEGACY_STORAGE_KEYS } from '@/domain/legacy-mapping';
import type { LegacyParseResult, MigrationReport } from '@/domain/legacy-mapping';
import { t, tn } from '@/i18n';
import { runLegacyMigration, previewLegacy } from '@/services/legacy-migration';
import type { LegacySource } from '@/services/legacy-migration';
import { ctx, refresh } from '@/state/store';
import { Button } from '@/ui/components/Button';
import { Banner } from '@/ui/components/Layout';
import { downloadText, stamp } from '@/ui/download';

/** Lossless copy of the raw legacy values, keyed by their LocalStorage key. */
export function legacyBackupJson(backups: LegacySource['backups']): string {
  const keys: Record<string, string> = {};
  if (backups.v2 !== undefined) keys[LEGACY_STORAGE_KEYS.v2] = backups.v2;
  if (backups.v1 !== undefined) keys[LEGACY_STORAGE_KEYS.v1] = backups.v1;
  return JSON.stringify({ kind: 'itam-legacy-backup', createdAt: new Date().toISOString(), keys }, null, 2);
}

export const downloadLegacyBackup = (backups: LegacySource['backups']): void =>
  downloadText(`inventory-legacy-backup-${stamp()}.json`, legacyBackupJson(backups));

type Stage =
  | { name: 'loading' }
  | { name: 'preview'; parsed: LegacyParseResult; report: MigrationReport }
  | { name: 'bad_source'; code: string }
  | { name: 'running' }
  | { name: 'done'; report: MigrationReport; invalid: number; duplicateSerials: number }
  | { name: 'failed'; code: string };

interface Props {
  source: LegacySource;
  /** Called when the user is finished. `migrated` => data was imported. */
  onFinish: (result: 'migrated' | 'skip' | 'cancel') => void;
  /** Full-screen first-run flow offers "start without importing"; Settings offers "cancel". */
  mode: 'first-run' | 'settings';
}

export function LegacyImportFlow({ source, onFinish, mode }: Props) {
  const [stage, setStage] = useState<Stage>({ name: 'loading' });

  const loadPreview = async (): Promise<void> => {
    setStage({ name: 'loading' });
    const r = await previewLegacy(ctx(), source.raw);
    setStage(r.ok ? { name: 'preview', parsed: r.value.parsed, report: r.value.report } : { name: 'bad_source', code: r.errors._form ?? 'invalid_json' });
  };
  useEffect(() => { void loadPreview(); }, []);

  const migrate = async (): Promise<void> => {
    setStage({ name: 'running' });
    try {
      const r = await runLegacyMigration(ctx(), source);
      if (!r.ok) { setStage({ name: 'failed', code: r.errors._form ?? 'unknown' }); return; }
      await refresh();
      setStage({ name: 'done', ...r.value });
    } catch (e) {
      setStage({ name: 'failed', code: e instanceof Error ? e.message : 'unknown' });
    }
  };

  const backupButton = (
    <Button onClick={() => downloadLegacyBackup(source.backups)} data-testid="download-legacy-backup">{t('migration.download_backup')}</Button>
  );
  const skipLabel = mode === 'first-run' ? t('migration.skip') : t('common.cancel');

  if (stage.name === 'loading' || stage.name === 'running') {
    return <div class="row" role="status"><div class="spinner" /><span>{stage.name === 'running' ? t('migration.running') : t('common.loading')}</span></div>;
  }

  if (stage.name === 'bad_source' || stage.name === 'failed') {
    return (
      <div class="stack">
        <Banner tone="danger">
          <strong>{stage.name === 'failed' ? t('migration.failed_title') : t('migration.unreadable_title')}</strong>
          <p>{stage.name === 'failed' ? t('migration.failed_text', { code: stage.code }) : t('migration.unreadable_text', { code: stage.code })}</p>
          <p>{t('migration.safe_note')}</p>
        </Banner>
        <div class="row">
          {backupButton}
          {stage.name === 'failed' && <Button variant="primary" onClick={() => void migrate()}>{t('migration.retry')}</Button>}
          <Button variant="ghost" onClick={() => onFinish('skip')}>{skipLabel}</Button>
        </div>
      </div>
    );
  }

  if (stage.name === 'done') {
    const { report } = stage;
    const skipped = report.skippedExistingSerial.length + stage.invalid + stage.duplicateSerials;
    return (
      <div class="stack">
        <Banner tone="success"><strong>{t('migration.done_title')}</strong></Banner>
        <div class="stat-list">
          <div><strong>{report.assetsToCreate}</strong><span>{t('nav.assets')}</span></div>
          <div><strong>{report.peopleToCreate}</strong><span>{t('nav.people')}</span></div>
          <div><strong>{report.locationsToCreate}</strong><span>{t('nav.locations')}</span></div>
        </div>
        {skipped > 0 && <Banner tone="warning">{tn('migration.skipped', skipped)}</Banner>}
        {report.ambiguousNames.length > 0 && <Banner tone="warning">{t('migration.review_names', { names: report.ambiguousNames.join(', ') })}</Banner>}
        {report.inconsistent.length > 0 && (
          <Banner tone="warning">{t('migration.review_inconsistent', { serials: report.inconsistent.map((x) => x.serial).join(', ') })}</Banner>
        )}
        <p class="muted">{t('migration.backup_kept')}</p>
        <div class="row"><Button variant="primary" onClick={() => onFinish('migrated')} data-testid="migration-continue">{t('common.continue')}</Button></div>
      </div>
    );
  }

  const { parsed, report } = stage;
  const invalidCount = parsed.invalid.length + parsed.duplicateSerials.length;
  return (
    <div class="stack">
      <p>{t('migration.intro')}</p>
      <div class="stat-list">
        <div><strong data-testid="mig-assets">{report.assetsToCreate}</strong><span>{t('migration.assets_to_create')}</span></div>
        <div><strong data-testid="mig-people">{report.peopleToCreate}</strong><span>{t('migration.people_to_create')}</span></div>
        <div><strong data-testid="mig-locations">{report.locationsToCreate}</strong><span>{t('migration.locations_to_create')}</span></div>
      </div>
      {report.skippedExistingSerial.length > 0 && <Banner>{tn('migration.already_present', report.skippedExistingSerial.length)}</Banner>}
      {invalidCount > 0 && <Banner tone="warning">{tn('migration.invalid_records', invalidCount)}</Banner>}
      {report.ambiguousNames.length > 0 && <Banner tone="warning">{t('migration.ambiguous_names', { names: report.ambiguousNames.join(', ') })}</Banner>}
      {report.inconsistent.length > 0 && <Banner tone="warning">{t('migration.inconsistent', { serials: report.inconsistent.map((x) => x.serial).join(', ') })}</Banner>}
      <p class="muted">{t('migration.safe_note')}</p>
      <div class="row">
        {backupButton}
        <Button variant="primary" onClick={() => void migrate()} data-testid="migrate-now">{t('migration.migrate')}</Button>
        <Button variant="ghost" onClick={() => onFinish(mode === 'first-run' ? 'skip' : 'cancel')} data-testid="migration-skip">{skipLabel}</Button>
      </div>
    </div>
  );
}
