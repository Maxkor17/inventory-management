import { useEffect, useState } from 'preact/hooks';
import { openIdbStore } from '@/data/idb/idb-store';
import { t } from '@/i18n';
import { detectLegacySource, getLegacyMigrationRecord, skipLegacyMigration } from '@/services/legacy-migration';
import type { LegacySource } from '@/services/legacy-migration';
import { loadDemoData } from '@/services/demo';
import { getWelcomed, setWelcomed } from '@/services/meta';
import { ctx, data, initStore, refresh } from '@/state/store';
import { Button } from '@/ui/components/Button';
import { Banner } from '@/ui/components/Layout';
import { toast } from '@/ui/components/Toast';
import { Database, Package } from '@/ui/icons';
import { App } from '../shell/App';
import { LegacyImportFlow } from '../migration/LegacyImportFlow';

type Phase =
  | { name: 'loading' }
  | { name: 'error'; code: string }
  | { name: 'migrate'; source: LegacySource }
  | { name: 'welcome' }
  | { name: 'ready' };

async function bootstrap(): Promise<Phase> {
  let store;
  try {
    store = await openIdbStore();
  } catch (e) {
    return { name: 'error', code: e instanceof Error ? e.message : 'unknown' };
  }
  const c = initStore(store);
  await refresh();
  // Ask the browser not to evict our data under storage pressure (best effort, no UI).
  try { void navigator.storage?.persist?.(); } catch { /* ignore */ }

  const d = data.value;
  if (d.assets.length || d.people.length || d.locations.length) return { name: 'ready' };

  const record = await getLegacyMigrationRecord(c);
  let source: LegacySource | null = null;
  try { source = detectLegacySource(localStorage); } catch { source = null; }
  if (source && !record) return { name: 'migrate', source };
  if (!(await getWelcomed(c))) return { name: 'welcome' };
  return { name: 'ready' };
}

function Frame({ children, wide }: { children: preact.ComponentChildren; wide?: boolean }) {
  return (
    <div class="fullscreen">
      <div class="fullscreen__panel" style={wide ? { width: 'min(820px, 100%)' } : undefined}>
        <div class="fullscreen__brand"><span class="sidebar__logo"><Package size={18} /></span>{t('app.name')}</div>
        {children}
      </div>
    </div>
  );
}

export function Boot() {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  useEffect(() => { void bootstrap().then(setPhase); }, []);

  if (phase.name === 'loading') {
    return <Frame><div class="row" role="status"><div class="spinner" /><span>{t('common.loading')}</span></div></Frame>;
  }

  if (phase.name === 'error') {
    return (
      <Frame>
        <Banner tone="danger"><strong>{t('boot.idb_title')}</strong><p>{t('boot.idb_text')}</p></Banner>
        <p class="muted">{t('boot.idb_hint')}</p>
        <div class="row"><a class="btn btn--primary" href="./legacy/v1.1/">{t('boot.open_legacy')}</a></div>
      </Frame>
    );
  }

  if (phase.name === 'migrate') {
    const source = phase.source;
    return (
      <Frame wide>
        <div><h1>{t('migration.title')}</h1></div>
        <LegacyImportFlow
          source={source}
          mode="first-run"
          onFinish={async (r) => {
            if (r === 'skip') {
              await skipLegacyMigration(ctx());
              setPhase((await getWelcomed(ctx())) ? { name: 'ready' } : { name: 'welcome' });
              return;
            }
            await setWelcomed(ctx());
            setPhase({ name: 'ready' });
          }}
        />
      </Frame>
    );
  }

  if (phase.name === 'welcome') {
    const start = async (demo: boolean): Promise<void> => {
      if (demo) {
        const r = await loadDemoData(ctx());
        if (!r.ok) { toast('error', t('err.demo_failed')); return; }
        await refresh();
      }
      await setWelcomed(ctx());
      setPhase({ name: 'ready' });
    };
    return (
      <Frame wide>
        <div><h1>{t('welcome.title')}</h1><p class="muted">{t('welcome.subtitle')}</p></div>
        <div class="choice">
          <div class="choice__item">
            <Database size={22} />
            <h2>{t('welcome.empty_title')}</h2>
            <p class="muted">{t('welcome.empty_text')}</p>
            <Button variant="primary" onClick={() => void start(false)} data-testid="start-empty">{t('welcome.empty_cta')}</Button>
          </div>
          <div class="choice__item">
            <Package size={22} />
            <h2>{t('welcome.demo_title')}</h2>
            <p class="muted">{t('welcome.demo_text')}</p>
            <Button onClick={() => void start(true)} data-testid="start-demo">{t('welcome.demo_cta')}</Button>
          </div>
        </div>
      </Frame>
    );
  }

  return <App />;
}
