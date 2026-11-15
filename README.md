# IT Asset Management

A modern, client-side IT asset management system (GLPI-style): equipment, people, assignments, maintenance tickets, an audit log and a live dashboard. It is a **static site**. It runs entirely in the browser, stores its data in IndexedDB, and is deployed to GitHub Pages.

- **Stack:** Preact + TypeScript, SCSS (design tokens, light/dark themes), Vite, IndexedDB (`idb`), Vitest, Playwright (system Chrome).
- **Languages:** English and Ukrainian (switch in the top bar).
- **Live URL (after deployment):** `https://maxkor17.github.io/inventory-management/`

> **Important — what this is *not*:** there is no server and no user accounts. All data lives in the browser profile of the device you use. It is not shared with colleagues, not synchronised and not protected by authentication. See [docs/LIMITATIONS.md](docs/LIMITATIONS.md). Download backups regularly.

## Features

| Area | What you get |
|---|---|
| **Assets** | Name, manufacturer, model, serial + unique inventory number, category, status, location, holder, purchase / in-service / warranty dates, supplier, cost, description, notes. Detail page with *Overview · Assignments · Maintenance · History* tabs. Search, filters (category, status, location, person, warranty), sorting, pagination, column picker, bulk edit (all-or-nothing), print-friendly card. |
| **People** | Directory with position, department, email, phone, location, start date, status. Deactivate without losing history; **offboarding wizard** transfers every held asset to someone else or returns it to stock. Per-person asset list and full assignment history. |
| **Assignments** | A ledger: every hand-over is a row (assigned / returned / reason). Rules keep status and holder consistent (e.g. *In use* needs a holder; *Retired* never has one). |
| **Maintenance** | Tickets with priority, status workflow (Open → In progress → Waiting → Resolved → Closed), specialist, work done, cost. Optional, explicit sync of the asset status (never hidden). |
| **Dashboard** | Totals by status, people, active assignments, warranties ending soon / expired, charts (category, status, location, purchases per year), recent activity. Every number is computed from your data. |
| **Activity log** | Typed, append-only events with before/after values. No fake "user" column: without authentication the app does not know who acted. |
| **Locations** | Catalogue of offices / rooms; cannot be deleted while in use. |
| **Data tools** | Full JSON backup + restore (validated, atomic, with a safety copy), CSV export of every list, **CSV import wizard** with column mapping and a validated preview, import of old v1.0/v1.1 JSON exports, one-time **migration** of data from earlier versions. |
| **UX** | Responsive (table → cards on phones, drawer navigation), light/dark/system theme, keyboard-accessible dialogs, EN/UK. |

## Getting started

Requires Node.js 22+.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit + integration tests (Vitest)
npm run build        # type-check + SCSS + production bundle in dist/
npm run test:e2e     # real-browser tests against dist/ served under /inventory-management/
```

`npm run test:e2e` needs Google Chrome. Set `CHROME_PATH` if it is not in the default location.

## First launch & your existing data

- **New browser, no old data:** a welcome screen offers *Start empty* or *Load demo data*. Demo records are flagged, shown with a banner and removable with one click; your real data is never touched by that.
- **Data from version 1.0 / 1.1 (LocalStorage):** the app shows an *Upgrade your data* screen with a preview of what will be created and a **Download backup** button. Nothing happens until you click *Migrate*. The old data is never modified or deleted. Details: [docs/MIGRATION.md](docs/MIGRATION.md).
- The previous version stays available at `./legacy/v1.1/`.

## Deploying to GitHub Pages

1. Push this branch / merge to `main`. (Nothing is pushed automatically.)
2. In the repository: **Settings → Pages → Build and deployment → Source = GitHub Actions**. Do this *before* merging, because the old *Deploy from a branch* setting would publish the unbuilt source.
3. The workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs unit tests, builds, runs the end-to-end tests and publishes `dist/`.

The build uses relative asset URLs (`base: './'`) and hash routes (`#/assets/…`), so it works from any repository path and survives a browser refresh without a 404 fallback.

## Project layout

```
src/
  domain/      pure business rules (types, validation, assignment rules, warranty, CSV, legacy mapping)
  data/        storage contract + IndexedDB implementation, demo dataset
  services/    use-cases; each runs in ONE transaction and writes its audit events
  state/       reactive snapshot (signals), preferences, selectors
  features/    screens (dashboard, assets, people, maintenance, locations, activity, settings, import, migration)
  ui/          reusable components and SVG charts
  i18n/        en.ts (source of truth) and uk.ts (type-checked against it)
  styles/      SCSS: abstracts (tokens, mixins) · themes · base · layout · components · pages
tests/         unit/ (Vitest) and e2e/ (Playwright)
public/legacy/ the previous app, byte-identical
docs/          architecture, data model, migration, limitations
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the layering rule and how a backend could be added later.
