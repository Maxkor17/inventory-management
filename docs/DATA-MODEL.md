# Data model

IndexedDB database `inventory-management-itam` (schema version 1). Stores: `assets`, `people`, `locations`, `assignments`, `tickets`, `activity` (key `id`) and `meta` (key `key`). Dates are `YYYY-MM-DD` strings; timestamps are ISO-8601 UTC. Enums are stored as codes.

| Entity | Fields |
|---|---|
| **Asset** | `inventoryNumber` (required, unique, case-insensitive), `name`, `manufacturer`, `model`, `serialNumber` (optional, unique if present), `category`, `status`, `locationId`, `assigneeId` (current holder — maintained only by services), `purchaseDate`, `commissionedDate`, `warrantyEndDate`, `supplier`, `cost`, `description`, `notes`, `isDemo`, timestamps |
| **Person** | `firstName`, `lastName`, `position`, `department`, `email` (unique if present), `phone`, `locationId`, `status` (active/inactive), `startDate`, `deactivatedAt`, `notes`, `isDemo` |
| **Location** | `name` (unique), `description` |
| **Assignment** | `assetId`, `personId`, `assignedAt`, `returnedAt` (null = active), `endReason`, `note` — at most one active row per asset |
| **Ticket** | `assetId`, `title`, `problem`, `priority`, `status`, `specialistId`, `workDone`, `cost`, `createdAt`, `resolvedAt`, `closedAt` |
| **ActivityEvent** | `at`, `type`, `entityType`, `entityId`, `entityLabel` (snapshot), `assetId`, `personId`, `changes[{field,from,to}]`, `params` — append-only, **no actor** |
| **meta** | `legacyMigration`, `legacyBackup`, `welcomed` |

Enums — categories: laptop, desktop, monitor, network_equipment, printer, mobile_device, server, peripheral, software, other. Statuses: in_use, in_stock, under_repair, retired, reserved, lost. Ticket priorities: low, medium, high, critical. Ticket statuses: open, in_progress, waiting, resolved, closed. Assignment end reasons: returned_to_stock, transferred, offboarding, asset_retired, asset_lost.

## Rules

- `in_use` requires a holder; `in_stock`, `retired`, `lost` never have one (changing to them closes the assignment); `under_repair` and `reserved` may keep or drop it.
- Only active people can receive assets. People are never deleted, only deactivated; deactivation is blocked while they hold assets (use offboarding).
- Deleting an asset removes its assignments and tickets; the activity log keeps the entries with a label snapshot.
- Ticket transitions: open → in_progress | waiting | closed; in_progress → waiting | resolved; waiting → in_progress | resolved; resolved → closed | in_progress (reopen); closed is final. Resolving requires a description of the work done.
- Warranty states relative to today: *expired* (< today), *ending soon* (today … today + N days, N configurable, default 30), *valid*, *not specified*. Retired and lost assets are ignored in warranty alerts.

## Backup file (`itam-backup`, version 3)

`{ schema, version: 3, exportedAt, data: { assets, people, locations, assignments, tickets, activity } }`. A backup is fully validated (structure, enum values, dates, duplicate ids, unique numbers, referential integrity, holder ↔ active-assignment consistency) **before** anything is written, and restoring replaces all data in one transaction.

## CSV (assets)

Columns: `inventory_number, name, manufacturer, model, serial_number, category, status, location, assignee, purchase_date, commissioned_date, warranty_end_date, supplier, cost, description, notes`. Required: `inventory_number`, `name`. Category/status accept codes or English names; dates `YYYY-MM-DD` or `DD.MM.YYYY`; the assignee is matched by email or full name. Cells starting with `= + - @` are prefixed with `'` on export (spreadsheet formula-injection guard) and unprefixed on import.
