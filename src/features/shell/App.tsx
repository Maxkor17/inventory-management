import { useEffect, useState } from 'preact/hooks';
import { isActiveTicket } from '@/domain/maintenance';
import { t } from '@/i18n';
import { href, navigate, route } from '@/router/router';
import { prefs, setPref } from '@/state/prefs';
import type { Theme } from '@/state/prefs';
import { data, hasDemoData } from '@/state/store';
import { ConfirmHost } from '@/ui/components/Modal';
import { ToastHost } from '@/ui/components/Toast';
import { History, LayoutDashboard, Menu, MapPin, Monitor, Moon, Package, Search, Settings, Sun, Users, Wrench } from '@/ui/icons';
import { Button } from '@/ui/components/Button';
import { ActivityPage } from '../activity/ActivityPage';
import { AssetDetailPage } from '../assets/AssetDetailPage';
import { AssetsPage } from '../assets/AssetsPage';
import { DashboardPage } from '../dashboard/DashboardPage';
import { ImportPage } from '../import/ImportPage';
import { LocationsPage } from '../locations/LocationsPage';
import { MaintenancePage } from '../maintenance/MaintenancePage';
import { PersonDetailPage } from '../people/PersonDetailPage';
import { PeoplePage } from '../people/PeoplePage';
import { SettingsPage } from '../settings/SettingsPage';
import { DemoBanner } from './DemoBanner';

function NotFound() {
  return <div class="page"><div class="empty"><h3>{t('notfound.title')}</h3><p>{t('notfound.text')}</p><a class="btn btn--primary" href={href([])}>{t('nav.dashboard')}</a></div></div>;
}

function currentPage() {
  const [section, id] = route.value.path;
  switch (section) {
    case undefined: return <DashboardPage />;
    case 'assets': return id ? <AssetDetailPage id={id} /> : <AssetsPage />;
    case 'people': return id ? <PersonDetailPage id={id} /> : <PeoplePage />;
    case 'maintenance': return <MaintenancePage />;
    case 'locations': return <LocationsPage />;
    case 'activity': return <ActivityPage />;
    case 'settings': return <SettingsPage />;
    case 'import': return <ImportPage />;
    default: return <NotFound />;
  }
}

const THEMES: { id: Theme; icon: typeof Sun; label: 'theme.light' | 'theme.system' | 'theme.dark' }[] = [
  { id: 'light', icon: Sun, label: 'theme.light' },
  { id: 'system', icon: Monitor, label: 'theme.system' },
  { id: 'dark', icon: Moon, label: 'theme.dark' },
];

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const section = route.value.path[0] ?? '';
  const d = data.value;
  const openTickets = d.tickets.filter((x) => isActiveTicket(x.status)).length;

  // Close the mobile menu and scroll to top on navigation.
  useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0); }, [route.value.path.join('/')]);

  const nav = [
    { id: '', to: [], icon: LayoutDashboard, label: t('nav.dashboard') },
    { id: 'assets', to: ['assets'], icon: Package, label: t('nav.assets'), count: d.assets.length },
    { id: 'people', to: ['people'], icon: Users, label: t('nav.people'), count: d.people.length },
    { id: 'maintenance', to: ['maintenance'], icon: Wrench, label: t('nav.maintenance'), count: openTickets },
    { id: 'locations', to: ['locations'], icon: MapPin, label: t('nav.locations'), count: d.locations.length },
    { id: 'activity', to: ['activity'], icon: History, label: t('nav.activity') },
    { id: 'settings', to: ['settings'], icon: Settings, label: t('nav.settings') },
  ];

  return (
    <div class="app">
      <aside class={`sidebar ${menuOpen ? 'is-open' : ''}`} aria-label={t('nav.main')}>
        <a class="sidebar__brand" href={href([])}>
          <span class="sidebar__logo"><Package size={18} /></span>
          {t('app.name')}
        </a>
        <nav class="sidebar__nav">
          {nav.map((n) => (
            <a key={n.id} class={`nav-link ${section === n.id ? 'is-active' : ''}`} href={href(n.to)} aria-current={section === n.id ? 'page' : undefined}>
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.count !== undefined && <span class="nav-link__count">{n.count}</span>}
            </a>
          ))}
        </nav>
        <div class="sidebar__foot">{t('app.local_note')}</div>
      </aside>
      {menuOpen && <div class="sidebar-scrim" onClick={() => setMenuOpen(false)} />}

      <div class="main">
        <header class="topbar">
          <Button variant="ghost" iconOnly class="topbar__menu" aria-label={t('nav.menu')} onClick={() => setMenuOpen(!menuOpen)}><Menu size={20} /></Button>
          <form
            class="topbar__search"
            role="search"
            onSubmit={(e) => { e.preventDefault(); navigate(['assets'], { q: q.trim() || undefined }); }}
          >
            <Search size={16} class="search-input__icon" />
            <input class="search-input" type="search" value={q} placeholder={t('search.global')} aria-label={t('search.global')} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
          </form>
          <div class="topbar__spacer" />
          <div class="topbar__actions">
            <div class="segmented" role="group" aria-label={t('theme.label')}>
              {THEMES.map((th) => (
                <button key={th.id} type="button" aria-pressed={prefs.value.theme === th.id} aria-label={t(th.label)} title={t(th.label)} onClick={() => setPref('theme', th.id)}>
                  <th.icon size={14} />
                </button>
              ))}
            </div>
            <div class="segmented" role="group" aria-label={t('lang.label')}>
              {(['en', 'uk'] as const).map((l) => (
                <button key={l} type="button" aria-pressed={prefs.value.lang === l} onClick={() => setPref('lang', l)} lang={l}>{l.toUpperCase()}</button>
              ))}
            </div>
          </div>
        </header>
        <main class="page" id="main">
          {hasDemoData.value && <DemoBanner />}
          {currentPage()}
        </main>
      </div>
      <ConfirmHost />
      <ToastHost />
    </div>
  );
}
