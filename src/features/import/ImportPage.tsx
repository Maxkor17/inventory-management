import { useMemo, useState } from 'preact/hooks';
import { CsvError, parseCsv } from '@/domain/csv';
import { ASSET_CSV_FIELDS, REQUIRED_CSV_FIELDS, assetCsvTemplate, autoMapColumns, planAssetCsvImport } from '@/domain/csv-assets';
import type { ColumnMapping, CsvField } from '@/domain/csv-assets';
import { t, tn } from '@/i18n';
import { href } from '@/router/router';
import { importAssetsFromCsv } from '@/services/import-csv';
import type { CsvImportOutcome } from '@/services/import-csv';
import { ctx, data, mutate } from '@/state/store';
import { Button, ButtonLink } from '@/ui/components/Button';
import { CheckField, errorText } from '@/ui/components/Fields';
import { Banner, Breadcrumb, Card, PageHeader } from '@/ui/components/Layout';
import { toast } from '@/ui/components/Toast';
import { downloadCsv, readFileText } from '@/ui/download';
import { FileUp } from '@/ui/icons';

const MAX_ROWS = 5000;
const PREVIEW_ROWS = 100;

type Step = 'upload' | 'review' | 'done';

export function ImportPage() {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [createLocations, setCreateLocations] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CsvImportOutcome | null>(null);

  const header = rows[0] ?? [];
  const body = useMemo(() => rows.slice(1), [rows]);
  const missingRequired = REQUIRED_CSV_FIELDS.filter((f) => mapping[f] === undefined);

  const plan = useMemo(
    () => (step === 'review' && !missingRequired.length
      ? planAssetCsvImport(body, mapping, { assets: data.value.assets, people: data.value.people, locations: data.value.locations })
      : null),
    [step, body, mapping, data.value.assets, data.value.people, data.value.locations],
  );

  const load = async (file: File): Promise<void> => {
    setError(null);
    const text = await readFileText(file).catch(() => null);
    if (text === null) { setError('file_unreadable'); return; }
    try {
      const parsed = parseCsv(text);
      if (parsed.rows.length < 2) { setError('csv_empty'); return; }
      if (parsed.rows.length - 1 > MAX_ROWS) { setError('csv_too_large'); return; }
      setRows(parsed.rows);
      setMapping(autoMapColumns(parsed.rows[0]!));
      setFileName(file.name);
      setStep('review');
    } catch (e) {
      setError(e instanceof CsvError ? 'csv_bad_quote' : 'file_unreadable');
    }
  };

  const reset = (): void => { setStep('upload'); setRows([]); setMapping({}); setFileName(''); setOutcome(null); setError(null); };

  const run = async (): Promise<void> => {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await mutate(() => importAssetsFromCsv(ctx(), plan, { createMissingLocations: createLocations }));
      if (!r.ok) { toast('error', errorText(r.errors._form ?? 'unknown')); return; }
      setOutcome(r.value);
      setStep('done');
    } finally { setBusy(false); }
  };

  const setCol = (field: CsvField, value: string): void => {
    const next = { ...mapping };
    if (value === '') delete next[field]; else next[field] = Number(value);
    setMapping(next);
  };

  const fieldErrorText = (errs: Record<string, string>): string =>
    Object.entries(errs).map(([f, c]) => `${f}: ${errorText(c)}`).join('; ');

  return (
    <>
      <Breadcrumb items={[{ label: t('nav.assets'), to: ['assets'] }, { label: t('import.title') }]} />
      <PageHeader title={t('import.title')} subtitle={t('import.subtitle')} />

      <ol class="steps" aria-label={t('import.steps')}>
        {(['upload', 'review', 'done'] as Step[]).map((s, i) => (
          <li key={s} class={step === s ? 'is-current' : (['upload', 'review', 'done'].indexOf(step) > i ? 'is-done' : '')}>{i + 1}. {t(`import.step_${s}` as never)}</li>
        ))}
      </ol>

      {step === 'upload' && (
        <Card>
          <div class="stack">
            <label
              class={`drop ${over ? 'is-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer?.files?.[0]; if (f) void load(f); }}
            >
              <FileUp size={28} />
              <strong>{t('import.drop')}</strong>
              <span>{t('import.drop_hint')}</span>
              <input type="file" accept=".csv,text/csv,text/plain" hidden data-testid="csv-input" onChange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; (e.currentTarget as HTMLInputElement).value = ''; if (f) void load(f); }} />
            </label>
            {error && <Banner tone="danger">{errorText(error)}</Banner>}
            <div class="row">
              <Button onClick={() => downloadCsv('assets-template.csv', assetCsvTemplate())}>{t('import.template')}</Button>
            </div>
            <div>
              <h3>{t('import.rules_title')}</h3>
              <ul>
                <li>{t('import.rule_required', { fields: REQUIRED_CSV_FIELDS.join(', ') })}</li>
                <li>{t('import.rule_enums')}</li>
                <li>{t('import.rule_dates')}</li>
                <li>{t('import.rule_atomic')}</li>
              </ul>
            </div>
          </div>
        </Card>
      )}

      {step === 'review' && (
        <>
          <Card title={t('import.mapping_title', { file: fileName })}>
            <div class="form-grid">
              {ASSET_CSV_FIELDS.map((f) => (
                <div class="field" key={f}>
                  <label class="field__label" for={`map-${f}`}>
                    <span class="mono">{f}</span>{(REQUIRED_CSV_FIELDS as readonly string[]).includes(f) && <span class="field__req">*</span>}
                  </label>
                  <select id={`map-${f}`} class="select" value={mapping[f] === undefined ? '' : String(mapping[f])} onChange={(e) => setCol(f, (e.currentTarget as HTMLSelectElement).value)} data-testid={`map-${f}`}>
                    <option value="">{t('import.not_mapped')}</option>
                    {header.map((h, i) => <option key={i} value={i}>{h || `(${i + 1})`}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {missingRequired.length > 0 && <Banner tone="danger"><span style={{ display: 'block', marginTop: 12 }}>{t('import.missing_required', { fields: missingRequired.join(', ') })}</span></Banner>}
          </Card>

          {plan && (
            <Card flush title={t('import.preview_title')}>
              <div class="toolbar">
                <strong data-testid="plan-valid">{tn('import.valid_rows', plan.validCount)}</strong>
                <strong style={{ color: plan.errorCount ? 'var(--danger)' : undefined }} data-testid="plan-errors">{tn('import.error_rows', plan.errorCount)}</strong>
                <span class="toolbar__spacer" />
                {plan.missingLocations.length > 0 && <CheckField label={t('import.create_locations', { names: plan.missingLocations.join(', ') })} checked={createLocations} onChange={setCreateLocations} />}
              </div>
              <div class="table-wrap">
                <table class="table">
                  <caption class="sr-only">{t('import.preview_title')}</caption>
                  <thead><tr><th>#</th><th>{t('field.inventoryNumber')}</th><th>{t('field.name')}</th><th>{t('field.category')}</th><th>{t('field.status')}</th><th>{t('import.problems')}</th></tr></thead>
                  <tbody>
                    {plan.rows.slice(0, PREVIEW_ROWS).map((r) => {
                      const bad = Object.keys(r.errors).length > 0;
                      return (
                        <tr key={r.line} class={bad ? 'row-error' : 'row-ok'}>
                          <td data-label="#">{r.line}</td>
                          <td data-label={t('field.inventoryNumber')} class="mono">{r.input.inventoryNumber}</td>
                          <td data-label={t('field.name')}>{r.input.name}</td>
                          <td data-label={t('field.category')}>{r.input.category}</td>
                          <td data-label={t('field.status')}>{r.input.status}</td>
                          <td data-label={t('import.problems')}>{bad ? fieldErrorText(r.errors) : <span class="muted">OK</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {plan.rows.length > PREVIEW_ROWS && <p class="muted" style={{ padding: '12px 20px' }}>{t('import.preview_limit', { n: PREVIEW_ROWS, total: plan.rows.length })}</p>}
              <div class="toolbar" style={{ borderTop: '1px solid var(--border)', borderBottom: 0 }}>
                <Button variant="primary" disabled={busy || plan.validCount === 0} onClick={() => void run()} data-testid="csv-import">
                  {tn('import.import_n', plan.validCount)}
                </Button>
                <Button onClick={reset}>{t('common.cancel')}</Button>
                {plan.errorCount > 0 && <span class="muted">{t('import.errors_skipped')}</span>}
              </div>
            </Card>
          )}
        </>
      )}

      {step === 'done' && outcome && (
        <Card>
          <div class="stack">
            <Banner tone="success"><strong>{t('import.done_title')}</strong></Banner>
            <div class="stat-list">
              <div><strong data-testid="done-imported">{outcome.imported}</strong><span>{t('import.imported')}</span></div>
              <div><strong data-testid="done-skipped">{outcome.skipped}</strong><span>{t('import.skipped')}</span></div>
              <div><strong>{outcome.locationsCreated}</strong><span>{t('import.locations_created')}</span></div>
            </div>
            <div class="row">
              <ButtonLink variant="primary" href={href(['assets'])}>{t('nav.assets')}</ButtonLink>
              <Button onClick={reset}>{t('import.another')}</Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
