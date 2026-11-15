# Migrating data from earlier versions

Versions 1.0 and 1.1 stored devices as a flat list in the browser's **LocalStorage** (`inventoryManagement.devices.v1` for v1.0, `inventoryManagement.devices.v2` for v1.1). Version 2.0 keeps its data in IndexedDB and has people, locations and assignments as separate entities.

## Safety guarantees

1. **The legacy keys are read-only.** The migration code is only given a `getItem`-style interface; it can never write or delete them (a unit test asserts this, and an end-to-end test checks the keys are byte-identical afterwards).
2. **Nothing happens silently.** If legacy data exists and the new database is empty, an *Upgrade your data* screen shows what will be created and offers **Download backup of old data** first.
3. **All or nothing.** The whole migration is one IndexedDB transaction. Before it may commit, the result is read back inside the transaction and compared with the plan (asset count, people, locations, every serial number). Failure at *any single write*, or a silently lost write, rolls everything back — verified by tests that fail every write position in turn.
4. **Recoverable.** On failure the original data is untouched, a copy is stored in the database, and you can retry, download the backup, or continue empty (the import stays available in Settings → *Data from previous versions*).
5. **No demo data** is ever added when legacy data exists.

## Mapping

| Legacy | New |
|---|---|
| device `id`, `name`, `model`, `serial` | same `id`, `name`, `model`, `serialNumber` |
| — | generated inventory number `IT-000001`, `IT-000002`, … (continues after existing numbers) |
| `category` / `status` labels | stable codes (`Network Equipment` → `network_equipment`, `In Use` → `in_use`) |
| `location` text | a **Location** record (de-duplicated, case / whitespace-insensitive) |
| `owner` text | a **Person** record (de-duplicated case-insensitively; first word = first name, the rest = last name) |
| `purchaseDate`, `warrantyDate` | `purchaseDate`, `warrantyEndDate` |
| owner + *In use / Under repair* | an **active assignment** |
| owner + *Retired* | a **closed assignment** (reason `asset_retired`) — history kept, no current holder |
| owner + *In stock* | a **closed assignment** (reason `returned_to_stock`); the legacy owner is also written to the asset's notes |

Things listed for review after migrating: owner names that could not be split into first/last name (the person gets a note), and assets whose status and holder do not fit together (e.g. *In use* without an owner — kept as is).

Records that were already invalid in the old data, or duplicate serial numbers, are skipped and counted; they remain in the untouched legacy data.

## Other ways in

- **Old JSON exports** (v1.0/v1.1 files, or a plain array) can be imported from Settings; they go through the same preview and rules.
- Migration can be run again; devices whose serial number already exists are skipped, so nothing is duplicated.
- The previous app remains available at `./legacy/v1.1/` and keeps using its own LocalStorage keys.

## Known limitations

- A v1.0/v1.1 tab that is still open keeps writing to the *old* keys; changes made there after migrating are not copied. Import again (duplicates are skipped) or re-enter them.
- Statuses in the legacy data were partly *derived* (owner ⇒ In use) by v1.1's own migration; review them.
