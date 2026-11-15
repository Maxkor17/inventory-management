# Architecture

## Layers

```
UI (Preact components, SCSS)      src/features, src/ui
   │  reads signals, calls services
Services (use-cases)              src/services      one function per business operation
   │                              each = ONE transaction + its audit events
Domain (pure)                     src/domain        no imports from other layers
   │
Data layer                        src/data          interfaces (store.ts) + IndexedDB (idb/)
```

Dependencies only point downwards. `domain` is plain TypeScript functions, so the important rules are unit-tested without a browser.

## Why IndexedDB (not LocalStorage)

- Assets, assignments, tickets and the activity log outgrow LocalStorage's ~5 MB limit.
- One IndexedDB transaction spans several stores, so "close the old assignment, open a new one, update the asset, write the audit event" is **atomic**: it either all happens or none of it does. This is tested by injecting a failure at every single write.

Rule for service code: inside a transaction callback only `await` operations of that transaction; anything else lets IndexedDB auto-commit early.

## Single place where an asset changes

`services/asset-core.ts → commitAssetChange` plans the status / holder rules (`domain/assignment.ts`), writes the asset, maintains the assignment ledger and writes the audit events. Editing, assigning, returning, bulk edits, offboarding and ticket status sync all go through it, so the rules cannot drift apart.

## State & routing

- `state/store.ts` keeps one reactive snapshot of all collections (`@preact/signals`); services write to the database and the snapshot is refreshed after a successful mutation. Filtering / sorting / aggregates are pure functions over arrays (comfortable to ~10k assets).
- Hash router (`#/assets/<id>?status=in_use`): works on GitHub Pages without a 404 fallback. List state (search, filters, sort, page) lives in the query string, so lists are bookmarkable and dashboard cards deep-link into filtered views.

## Adding a backend later

Services depend only on `DataStore` / `Tx` / `Collection` (`src/data/store.ts`). A future `HttpStore` implementing those interfaces can replace `IdbStore` without changing domain, services or UI. Honest caveats: filtering and sorting currently run client-side, and the transaction semantics (atomic multi-entity writes) would need an equivalent server-side operation; authentication would also enable a real actor in the audit log.

## Styling

SCSS design tokens live in `styles/abstracts/_tokens.scss` as two colour maps (light / dark) emitted as CSS custom properties. Components only use `var(--token)`, so themes switch at runtime. `data-theme="system"` follows `prefers-color-scheme`.

## i18n

`en.ts` is the source of truth; `uk.ts` is typed `Record<keyof typeof en, string>`, so a missing translation is a compile error. Plural groups (`_one/_few/_many/_other`) use `Intl.PluralRules`. Enum values are stored as stable codes (`in_use`) and translated for display. Unit tests check key parity, placeholder parity, plural completeness and that every dynamically built key exists.
