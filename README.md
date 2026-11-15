# Inventory Management

A simple web app for tracking company IT equipment. Pure HTML, CSS and vanilla JavaScript: no backend, no build step, no dependencies.

## Features

- Dashboard: total devices, responsible specialists, devices without a specialist
- Add, edit and delete devices (delete asks for confirmation)
- Required fields (name, model, serial number) and unique serial numbers (case-insensitive)
- Search by name, model, serial number and responsible specialist
- Data is saved automatically in LocalStorage under the key `inventoryManagement.devices.v1`
- Export to JSON and import from JSON (structure and duplicate checks)
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

## JSON format

Export produces:

```json
{
  "version": 1,
  "exportedAt": "2026-01-01T12:00:00.000Z",
  "devices": [
    { "id": "abc", "name": "Laptop", "model": "Dell Latitude", "serial": "SN-1", "owner": "Jane Doe" }
  ]
}
```

Import also accepts a plain array of devices. `name`, `model` and `serial` must be non-empty text; `owner` is optional text. If any record is invalid, nothing is imported. Records whose serial number already exists (in the app or earlier in the file) are skipped. Import adds to existing data and never replaces it.

## Limitations

- Data lives only in the current browser on the current device; clearing site data deletes it. Use Export JSON for backups.
- No users, sync between devices or change history.
- LocalStorage has a limit of roughly 5 MB; if it is full or disabled, the app shows a warning and works in memory only.
- Serial numbers are compared ignoring case and surrounding spaces.
- Responsible specialists are free-text names; the same person is counted once regardless of letter case.
