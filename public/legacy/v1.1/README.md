# Inventory Management (v1.1)

A simple web app for tracking company IT equipment. Pure HTML, CSS and vanilla JavaScript: no backend, no build step, no dependencies.

## Features

- Dashboard: total devices, responsible specialists, devices without a specialist
- Add, edit and delete devices (delete asks for confirmation)
- Search by name, model, serial number, responsible specialist, category, status and location
- Status and warranty indicators in the device list
- Data is saved automatically in LocalStorage under the key `inventoryManagement.devices.v2`
- Export to JSON and import from JSON (structure, value and duplicate checks)
- A few demo records on the very first launch only, when no data exists yet

## Files

```
index.html   page markup
style.css    styles (responsive)
app.js       application logic
README.md    this file
```

## Run locally

Open `index.html` in any modern browser (double-click it). Alternatively, serve the folder:

```
python -m http.server 8000
```

then open http://localhost:8000.

## Publish on GitHub Pages

1. Create a repository on GitHub and push these four files to the root of the `main` branch.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose branch `main` and folder `/ (root)`, then **Save**.
4. After a minute the site is available at `https://<your-username>.github.io/<repository-name>/`.

When you change `style.css` or `app.js`, bump the `?v=` number in the two tags in `index.html` so browsers do not use cached copies.

## Data model

| Field | Required | Values |
|---|---|---|
| `id` | generated | unique text |
| `name` | yes | text |
| `model` | yes | text |
| `serial` | yes | text, unique (ignoring case and surrounding spaces) |
| `category` | yes | Laptop, Desktop, Monitor, Network Equipment, Printer, Mobile Device, Other |
| `status` | yes | In Use, In Stock, Under Repair, Retired |
| `owner` | no | responsible specialist, free text |
| `location` | no | office, room or department, free text |
| `purchaseDate` | no | `YYYY-MM-DD` |
| `warrantyDate` | no | `YYYY-MM-DD`, not earlier than the purchase date |

### Warranty indicators

| Warranty date | Indicator |
|---|---|
| in the past | red **Expired** |
| today up to 30 days ahead | amber **Expires today / Expires in N days** |
| more than 30 days ahead | green **Valid** |
| empty | **Not specified** |

## Migration from v1.0

Version 1.0 stored data under `inventoryManagement.devices.v1`. On the first start of v1.1:

1. If `...v2` already exists, it is used and nothing is migrated.
2. If only `...v1` exists, its records are copied to `...v2` with these defaults:
   - `status` = **In Use** if the record has a responsible specialist, otherwise **In Stock**
   - `category` = **Other**
   - `location`, `purchaseDate`, `warrantyDate` = empty
   - `id`, `name`, `model`, `serial` and `owner` are kept unchanged
3. The new data is read back from LocalStorage and compared before the migration counts as done.
4. The `...v1` key is **never modified or deleted**. It stays as a backup, and v1.0 would still work with it.
5. If the migration fails (unreadable data, storage full or disabled), the app shows an error, keeps your original data untouched, saves a copy under `...v1.backup` when possible, and does **not** add demo data.
6. Demo data is added only when neither `...v2` nor `...v1` exists.

If some old records are invalid or have duplicate serial numbers, the valid ones are migrated, the app tells you how many were skipped, and the skipped ones remain in the untouched v1 data.

## JSON export and import

Export produces a `inventory-YYYY-MM-DD.json` file:

```json
{
  "version": 2,
  "exportedAt": "2026-01-01T12:00:00.000Z",
  "devices": [
    {
      "id": "abc", "name": "Laptop", "model": "Dell Latitude", "serial": "SN-1",
      "category": "Laptop", "status": "In Use", "owner": "Jane Doe",
      "location": "Office 2", "purchaseDate": "2025-01-10", "warrantyDate": "2028-01-10"
    }
  ]
}
```

Import accepts:

- v2 files (`"version": 2`)
- v1.0 files (`"version": 1`, old fields only): missing new fields get the same defaults as the migration
- a plain array of devices

Rules:

- `name`, `model` and `serial` must be non-empty text.
- If present, `category` and `status` must be one of the allowed values (letter case is ignored), and dates must be real `YYYY-MM-DD` dates.
- **If any record is invalid, the whole import is rejected** and your existing data is not changed.
- Files with a `version` newer than 2 are rejected.
- Records whose serial number already exists (in the app or earlier in the file) are skipped.
- Import adds to existing data and never replaces it.

## Limitations

- Data lives only in the current browser on the current device; clearing site data deletes it. Use Export JSON for backups.
- No users, sync between devices or change history.
- LocalStorage has a limit of roughly 5 MB; if it is full or disabled, the app shows a warning and works in memory only. The old v1 data and the v2 copy take space side by side.
- If an older v1.0 tab is still open, it keeps writing to the v1 key; those later changes are not copied to v2.
- Migrated statuses are a best guess: a device with a responsible specialist is assumed to be In Use. Review them after upgrading.
- Warranty status is calculated from the date on your device's clock.
- Serial numbers are compared ignoring case and surrounding spaces.
- Responsible specialists and locations are free text. The same specialist name in a different letter case counts as one person.
- Stored records that are invalid (only possible after manual edits of LocalStorage) are skipped on load and dropped on the next save; the app shows a warning.
