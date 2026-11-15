# Limitations of this storage model

This is a static site with browser-side storage. It deliberately does **not** pretend to be a multi-user system.

| Limitation | Consequence | Mitigation |
|---|---|---|
| Data lives in one browser profile on one device | Not shared with colleagues, not synchronised between devices | JSON backup / restore; CSV export; a backend can replace the storage layer (see ARCHITECTURE.md) |
| Clearing site data, uninstalling the browser, or private windows | Data is deleted or invisible | Regular backups. The app asks the browser for persistent storage, but this is not guaranteed |
| No authentication or roles | Anyone with access to the browser profile can read and change everything; the activity log **cannot say who** made a change | Entries record what and when only; do not rely on the log for compliance |
| All `*.github.io` sites of one account share a browser origin | Different projects could in principle read each other's storage | This app namespaces its database/keys; do not store secrets here |
| Several tabs share one database | Edits in two tabs at once can overwrite each other's view until refresh | Use one tab for editing |
| Everything is loaded into memory | Comfortable up to ~10,000 assets; beyond that a server-side query layer is needed | — |
| Warranty and "today" use the device clock | A wrong device date gives wrong warranty states | — |
| Scheduled reminders / e-mail alerts are not possible on static hosting | Only visual warranty indicators and the dashboard | — |
| Not implemented (by design) | QR codes (a URL in a QR would not resolve on other devices), software licence/seat management, hierarchical locations, attachments, multi-currency | Possible extensions |
| Only the latest legacy format is imported | v1.0/v1.1 JSON exports and LocalStorage data are supported | — |

Browsers tested: Chrome only. Safari, Firefox and real phones have not been tested.
