"use strict";

/* ===== Constants ===== */
const STORAGE_KEY = "inventoryManagement.devices.v2";
const LEGACY_KEY = "inventoryManagement.devices.v1"; // v1.0 data: read-only, never modified or deleted
const EXPORT_VERSION = 2;
const WARRANTY_WARNING_DAYS = 30;

const CATEGORIES = ["Laptop", "Desktop", "Monitor", "Network Equipment", "Printer", "Mobile Device", "Other"];
const STATUSES = ["In Use", "In Stock", "Under Repair", "Retired"];
const DEFAULT_CATEGORY = "Other";
const DEFAULT_NEW_STATUS = "In Stock"; // preselected in the "Add device" form

const STATUS_BADGE = {
  "In Use": "badge-success",
  "In Stock": "badge-info",
  "Under Repair": "badge-warning",
  "Retired": "badge-neutral"
};

/* ===== State ===== */
const state = {
  devices: [],
  query: "",
  editingId: null
};

/* ===== DOM ===== */
const $ = (id) => document.getElementById(id);
const FIELD_KEYS = ["name", "model", "serial", "category", "status", "owner", "location", "purchaseDate", "warrantyDate"];
const FIELD_IDS = {
  name: "f-name", model: "f-model", serial: "f-serial", category: "f-category", status: "f-status",
  owner: "f-owner", location: "f-location", purchaseDate: "f-purchase", warrantyDate: "f-warranty"
};
const ERROR_IDS = {
  name: "e-name", model: "e-model", serial: "e-serial", category: "e-category", status: "e-status",
  owner: "e-owner", location: "e-location", purchaseDate: "e-purchase", warrantyDate: "e-warranty"
};

const els = {
  total: $("stat-total"),
  owners: $("stat-owners"),
  unassigned: $("stat-unassigned"),
  form: $("device-form"),
  formTitle: $("form-title"),
  submitBtn: $("submit-btn"),
  cancelBtn: $("cancel-btn"),
  search: $("search"),
  rows: $("device-rows"),
  empty: $("empty"),
  notice: $("notice"),
  exportBtn: $("export-btn"),
  importBtn: $("import-btn"),
  importFile: $("import-file"),
  fields: {},
  errors: {}
};
for (const key of FIELD_KEYS) {
  els.fields[key] = $(FIELD_IDS[key]);
  els.errors[key] = $(ERROR_IDS[key]);
}

/* ===== Helpers ===== */
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normSerial(value) {
  return String(value).trim().toLowerCase();
}

function showNotice(message, type) {
  els.notice.textContent = message;
  els.notice.className = "notice" + (type ? " " + type : "");
  els.notice.hidden = false;
}

function hideNotice() {
  els.notice.hidden = true;
}

/* ===== Dates ===== */
function pad2(n) {
  return String(n).padStart(2, "0");
}

/* Today as local "YYYY-MM-DD". */
function todayString() {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

/* Empty string or a real calendar date in YYYY-MM-DD format. */
function isValidDate(value) {
  if (value === "") return true;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function dateToDays(value) {
  const [y, m, d] = value.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/* Returns { label, cls } describing the warranty state. */
function warrantyStatus(dateStr, todayStr) {
  if (!dateStr) return { label: "Not specified", cls: "muted" };
  const days = dateToDays(dateStr) - dateToDays(todayStr);
  if (days < 0) return { label: "Expired", cls: "badge-danger" };
  if (days === 0) return { label: "Expires today", cls: "badge-warning" };
  if (days <= WARRANTY_WARNING_DAYS) return { label: "Expires in " + days + (days === 1 ? " day" : " days"), cls: "badge-warning" };
  return { label: "Valid", cls: "badge-success" };
}

function addDaysToToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

/* ===== Record validation / normalization ===== */
function pickEnum(value, list, fallback, label) {
  if (value === undefined || value === null) return { value: fallback };
  if (typeof value !== "string") return { error: label + " must be text" };
  const found = list.find((item) => item.toLowerCase() === value.trim().toLowerCase());
  if (!found) return { error: "unknown " + label + " \"" + value + "\"" };
  return { value: found };
}

function pickText(value, label) {
  if (value === undefined || value === null) return { value: "" };
  if (typeof value !== "string") return { error: label + " must be text" };
  return { value: value.trim() };
}

function pickDate(value, label) {
  if (value === undefined || value === null) return { value: "" };
  if (typeof value !== "string" || !isValidDate(value.trim())) return { error: "invalid " + label };
  return { value: value.trim() };
}

/*
 * Single entry point for every record that comes from storage, migration or import.
 * Fields missing in older data get defaults; fields that are present but wrong are errors.
 * Returns { record } or { error }.
 */
function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "not an object" };

  for (const key of ["name", "model", "serial"]) {
    if (typeof raw[key] !== "string" || !raw[key].trim()) return { error: key + " is required" };
  }
  const owner = pickText(raw.owner, "owner");
  if (owner.error) return { error: owner.error };

  const category = pickEnum(raw.category, CATEGORIES, DEFAULT_CATEGORY, "category");
  if (category.error) return { error: category.error };

  const status = pickEnum(raw.status, STATUSES, owner.value ? "In Use" : "In Stock", "status");
  if (status.error) return { error: status.error };

  const location = pickText(raw.location, "location");
  if (location.error) return { error: location.error };

  const purchaseDate = pickDate(raw.purchaseDate, "purchase date");
  if (purchaseDate.error) return { error: purchaseDate.error };

  const warrantyDate = pickDate(raw.warrantyDate, "warranty date");
  if (warrantyDate.error) return { error: warrantyDate.error };

  if (purchaseDate.value && warrantyDate.value && warrantyDate.value < purchaseDate.value) {
    return { error: "warranty date is earlier than purchase date" };
  }

  return {
    record: {
      id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
      name: raw.name.trim(),
      model: raw.model.trim(),
      serial: raw.serial.trim(),
      category: category.value,
      status: status.value,
      owner: owner.value,
      location: location.value,
      purchaseDate: purchaseDate.value,
      warrantyDate: warrantyDate.value
    }
  };
}

/* Normalizes a list, skipping invalid records and duplicate serials. */
function normalizeList(list) {
  const seen = new Set();
  const devices = [];
  let invalid = 0;
  let duplicates = 0;
  for (const item of list) {
    const result = normalizeRecord(item);
    if (result.error) { invalid++; continue; }
    const key = normSerial(result.record.serial);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    devices.push(result.record);
  }
  return { devices, invalid, duplicates };
}

/* ===== Storage ===== */
/* Writes the list and reads it back to make sure it was stored correctly. Throws on failure. */
function writeDevices(devices) {
  const text = JSON.stringify(devices);
  localStorage.setItem(STORAGE_KEY, text);
  if (localStorage.getItem(STORAGE_KEY) !== text) {
    throw new Error("the data read back from LocalStorage does not match what was written");
  }
}

function saveDevices() {
  try {
    writeDevices(state.devices);
    return true;
  } catch (err) {
    showNotice("Could not save data to LocalStorage (storage may be full or disabled). Changes will be lost on reload. Use Export JSON to keep a copy.", "error");
    return false;
  }
}

function seedDemoDevices() {
  const demo = [
    { name: "Laptop", model: "Dell Latitude 5420", serial: "DL-5420-0001", category: "Laptop", status: "In Use",
      owner: "Olena Kovalenko", location: "Office 2, Room 14", purchaseDate: addDaysToToday(-300), warrantyDate: addDaysToToday(430) },
    { name: "Monitor", model: "LG UltraFine 27UN850", serial: "LG-27UN-0042", category: "Monitor", status: "In Use",
      owner: "Andrii Shevchenko", location: "Office 2, Room 15", purchaseDate: addDaysToToday(-700), warrantyDate: addDaysToToday(20) },
    { name: "Network switch", model: "Cisco Catalyst 2960", serial: "CS-2960-0107", category: "Network Equipment", status: "In Stock",
      owner: "", location: "Server room", purchaseDate: "", warrantyDate: "" },
    { name: "Printer", model: "HP LaserJet Pro M404", serial: "HP-M404-0233", category: "Printer", status: "Retired",
      owner: "Olena Kovalenko", location: "Reception", purchaseDate: addDaysToToday(-1500), warrantyDate: addDaysToToday(-400) }
  ];
  return demo.map((d) => ({ id: newId(), ...d }));
}

/* Parses stored v2 data. Invalid records are skipped and reported. */
function parseStored(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    const result = normalizeList(parsed);
    const skipped = result.invalid + result.duplicates;
    if (skipped > 0) {
      showNotice(skipped + " stored record(s) were invalid or duplicated and were not loaded. They will be dropped from storage on the next save.", "error");
    }
    return result.devices;
  } catch (err) {
    // Keep the unreadable data under another key so it is not lost.
    try { localStorage.setItem(STORAGE_KEY + ".corrupt", raw); } catch (e) { /* ignore */ }
    showNotice("Stored data was unreadable and could not be loaded. A copy was kept under the key \"" + STORAGE_KEY + ".corrupt\". Starting with an empty list.", "error");
    return [];
  }
}

/*
 * One-time migration v1 -> v2. The v1 key is only ever read.
 * Returns the migrated devices (also when saving them failed, so nothing is lost on screen).
 */
function migrateLegacy(rawLegacy) {
  let devices = [];
  try {
    const parsed = JSON.parse(rawLegacy);
    if (!Array.isArray(parsed)) throw new Error("v1 data is not a list of devices");

    const result = normalizeList(parsed);
    devices = result.devices;

    writeDevices(devices); // includes read-back verification

    const skipped = result.invalid + result.duplicates;
    if (skipped > 0) {
      showNotice("Migrated " + devices.length + " device(s) to the new format, but " + skipped +
        " record(s) in the old data were invalid or duplicated and were not migrated. The original v1 data is kept unchanged under \"" + LEGACY_KEY + "\".", "error");
    } else {
      showNotice("Your " + devices.length + " device(s) were migrated to the new format. The original data is kept as a backup under \"" + LEGACY_KEY + "\".", "success");
    }
    return devices;
  } catch (err) {
    // Do not leave a half-written v2 behind: it would be mistaken for a finished migration.
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }

    let backupNote = "";
    try {
      localStorage.setItem(LEGACY_KEY + ".backup", rawLegacy);
      backupNote = " A backup copy was saved under \"" + LEGACY_KEY + ".backup\".";
    } catch (e) {
      backupNote = " A backup copy could not be saved.";
    }
    showNotice("Migration to the new data format failed: " + err.message + ". Your original data is unchanged under \"" +
      LEGACY_KEY + "\"." + backupNote + " Demo data was not added.", "error");
    return devices;
  }
}

function loadDevices() {
  let rawV2, rawV1;
  try {
    rawV2 = localStorage.getItem(STORAGE_KEY);
    rawV1 = rawV2 === null ? localStorage.getItem(LEGACY_KEY) : null;
  } catch (err) {
    showNotice("LocalStorage is unavailable. Data will not be saved between sessions.", "error");
    return [];
  }

  if (rawV2 !== null) return parseStored(rawV2);
  if (rawV1 !== null) return migrateLegacy(rawV1);

  // First run: no data under either key -> seed demo records.
  state.devices = seedDemoDevices();
  saveDevices();
  return state.devices;
}

/* ===== Rendering ===== */
function renderStats() {
  const owners = new Set();
  let unassigned = 0;
  for (const d of state.devices) {
    if (d.owner) owners.add(d.owner.toLowerCase());
    else unassigned++;
  }
  els.total.textContent = state.devices.length;
  els.owners.textContent = owners.size;
  els.unassigned.textContent = unassigned;
}

function getVisibleDevices() {
  const q = state.query.trim().toLowerCase();
  if (!q) return state.devices;
  return state.devices.filter((d) =>
    [d.name, d.model, d.serial, d.owner, d.category, d.status, d.location].some((v) => v.toLowerCase().includes(q))
  );
}

function makeBadge(text, cls) {
  const span = document.createElement("span");
  span.className = "badge " + cls;
  span.textContent = text;
  return span;
}

/* content: a string or an array of nodes */
function makeCell(label, content, className) {
  const td = document.createElement("td");
  td.dataset.label = label;
  if (typeof content === "string") {
    td.textContent = content;
  } else {
    const stack = document.createElement("span");
    stack.className = "cell-stack";
    content.forEach((node) => stack.appendChild(node));
    td.appendChild(stack);
  }
  if (className) td.className = className;
  return td;
}

function makeSpan(text, className) {
  const span = document.createElement("span");
  span.textContent = text;
  if (className) span.className = className;
  return span;
}

function makeButton(text, className, handler) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-small " + className;
  btn.textContent = text;
  btn.addEventListener("click", handler);
  return btn;
}

function renderTable() {
  const visible = getVisibleDevices();
  const today = todayString();
  els.rows.textContent = "";

  for (const d of visible) {
    const tr = document.createElement("tr");
    if (d.id === state.editingId) tr.className = "editing";

    tr.appendChild(makeCell("Device", [makeSpan(d.name, "device-name"), makeSpan(d.model, "sub")]));
    tr.appendChild(makeCell("Serial number", d.serial));
    tr.appendChild(makeCell("Category", d.category));
    tr.appendChild(makeCell("Status", [makeBadge(d.status, STATUS_BADGE[d.status] || "badge-neutral")]));
    tr.appendChild(d.location
      ? makeCell("Location", d.location)
      : makeCell("Location", "Not specified", "unassigned"));
    tr.appendChild(d.owner
      ? makeCell("Responsible", d.owner)
      : makeCell("Responsible", "Unassigned", "unassigned"));

    if (d.warrantyDate) {
      const w = warrantyStatus(d.warrantyDate, today);
      tr.appendChild(makeCell("Warranty until", [makeSpan(d.warrantyDate), makeBadge(w.label, w.cls)]));
    } else {
      tr.appendChild(makeCell("Warranty until", "Not specified", "unassigned"));
    }

    const actions = document.createElement("td");
    actions.className = "actions";
    actions.appendChild(makeButton("Edit", "btn-secondary", () => startEdit(d.id)));
    actions.appendChild(makeButton("Delete", "btn-danger", () => deleteDevice(d.id)));
    tr.appendChild(actions);

    els.rows.appendChild(tr);
  }

  if (visible.length === 0) {
    els.empty.textContent = state.devices.length === 0
      ? "No devices yet. Add your first device above."
      : "No devices match your search.";
    els.empty.hidden = false;
  } else {
    els.empty.hidden = true;
  }
}

function render() {
  renderStats();
  renderTable();
}

/* ===== Form ===== */
function fillSelect(select, items, defaultValue) {
  for (const item of items) {
    // 3rd argument sets the default, so form.reset() restores it.
    select.appendChild(new Option(item, item, item === defaultValue, item === defaultValue));
  }
}

function clearErrors() {
  for (const key of FIELD_KEYS) {
    els.errors[key].textContent = "";
    els.fields[key].classList.remove("invalid");
  }
}

function setError(key, message) {
  els.errors[key].textContent = message;
  els.fields[key].classList.add("invalid");
}

function resetForm() {
  els.form.reset();
  clearErrors();
  state.editingId = null;
  els.formTitle.textContent = "Add device";
  els.submitBtn.textContent = "Add device";
  els.cancelBtn.hidden = true;
}

function startEdit(id) {
  const d = state.devices.find((x) => x.id === id);
  if (!d) return;
  state.editingId = id;
  clearErrors();
  hideNotice();
  for (const key of FIELD_KEYS) els.fields[key].value = d[key];
  els.formTitle.textContent = "Edit device";
  els.submitBtn.textContent = "Save changes";
  els.cancelBtn.hidden = false;
  renderTable();
  els.form.scrollIntoView({ behavior: "smooth", block: "start" });
  els.fields.name.focus();
}

function readForm() {
  const values = {};
  for (const key of FIELD_KEYS) values[key] = els.fields[key].value.trim();
  return values;
}

function validateForm(values) {
  let valid = true;
  clearErrors();

  if (!values.name) { setError("name", "Name is required."); valid = false; }
  if (!values.model) { setError("model", "Model is required."); valid = false; }
  if (!values.serial) {
    setError("serial", "Serial number is required.");
    valid = false;
  } else {
    const key = normSerial(values.serial);
    const clash = state.devices.some((d) => d.id !== state.editingId && normSerial(d.serial) === key);
    if (clash) { setError("serial", "A device with this serial number already exists."); valid = false; }
  }

  if (!CATEGORIES.includes(values.category)) { setError("category", "Choose a category."); valid = false; }
  if (!STATUSES.includes(values.status)) { setError("status", "Choose a status."); valid = false; }

  if (!isValidDate(values.purchaseDate)) { setError("purchaseDate", "Enter a valid date."); valid = false; }
  if (!isValidDate(values.warrantyDate)) { setError("warrantyDate", "Enter a valid date."); valid = false; }
  if (valid && values.purchaseDate && values.warrantyDate && values.warrantyDate < values.purchaseDate) {
    setError("warrantyDate", "Warranty cannot expire before the purchase date.");
    valid = false;
  }
  return valid;
}

function handleSubmit(event) {
  event.preventDefault();
  hideNotice();

  const values = readForm();
  if (!validateForm(values)) return;

  if (state.editingId) {
    const d = state.devices.find((x) => x.id === state.editingId);
    if (d) Object.assign(d, values);
    showNotice("Device updated.", "success");
  } else {
    state.devices.push({ id: newId(), ...values });
    showNotice("Device added.", "success");
  }

  saveDevices(); // on failure it replaces the success notice with an error
  resetForm();
  render();
}

function deleteDevice(id) {
  const d = state.devices.find((x) => x.id === id);
  if (!d) return;
  if (!window.confirm("Delete device \"" + d.name + "\" (" + d.serial + ")? This cannot be undone.")) return;

  state.devices = state.devices.filter((x) => x.id !== id);
  if (state.editingId === id) resetForm();
  const saved = saveDevices();
  if (saved) showNotice("Device deleted.", "success");
  render();
}

/* ===== Export / Import ===== */
function exportJson() {
  try {
    const payload = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      devices: state.devices
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory-" + todayString() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotice("Exported " + state.devices.length + " device(s).", "success");
  } catch (err) {
    showNotice("Export failed: " + err.message, "error");
  }
}

/* Parses and validates import text. Throws Error with a readable message. */
function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error("The file is not valid JSON.");
  }

  let list;
  if (Array.isArray(data)) {
    list = data; // bare array of devices
  } else if (data && typeof data === "object" && Array.isArray(data.devices)) {
    if (data.version !== undefined && (typeof data.version !== "number" || data.version < 1)) {
      throw new Error("Invalid file version.");
    }
    if (data.version > EXPORT_VERSION) {
      throw new Error("This file was created by a newer version of the app (format version " + data.version + ").");
    }
    list = data.devices;
  } else {
    throw new Error("Invalid structure: expected an array of devices or an object with a \"devices\" array.");
  }

  const records = [];
  const problems = [];
  list.forEach((item, i) => {
    const result = normalizeRecord(item);
    if (result.record) records.push(result.record);
    else problems.push("#" + (i + 1) + " (" + result.error + ")");
  });

  if (problems.length) {
    const shown = problems.slice(0, 5).join("; ") + (problems.length > 5 ? "; ... and " + (problems.length - 5) + " more" : "");
    throw new Error("Invalid records: " + shown + ". Nothing was imported.");
  }
  return records;
}

function importJson(text) {
  let records;
  try {
    records = parseImport(text);
  } catch (err) {
    showNotice("Import failed. " + err.message, "error");
    return;
  }

  const known = new Set(state.devices.map((d) => normSerial(d.serial)));
  const existingIds = new Set(state.devices.map((d) => d.id));
  let added = 0;
  let duplicates = 0;

  for (const rec of records) {
    const key = normSerial(rec.serial);
    if (known.has(key)) { duplicates++; continue; }
    if (existingIds.has(rec.id)) rec.id = newId();
    known.add(key);
    existingIds.add(rec.id);
    state.devices.push(rec);
    added++;
  }

  const message = "Import finished: " + added + " added, " + duplicates + " skipped as duplicate serial number(s).";
  if (added > 0 && !saveDevices()) {
    render();
    return; // storage error notice already shown
  }
  showNotice(message, added > 0 || duplicates === 0 ? "success" : "");
  render();
}

function handleImportFile() {
  const file = els.importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => importJson(String(reader.result));
  reader.onerror = () => showNotice("Import failed. The file could not be read.", "error");
  reader.readAsText(file);
  els.importFile.value = ""; // allow re-importing the same file
}

/* ===== Init ===== */
function init() {
  fillSelect(els.fields.category, CATEGORIES, DEFAULT_CATEGORY);
  fillSelect(els.fields.status, STATUSES, DEFAULT_NEW_STATUS);

  state.devices = loadDevices();

  els.form.addEventListener("submit", handleSubmit);
  els.cancelBtn.addEventListener("click", () => { resetForm(); hideNotice(); renderTable(); });
  els.search.addEventListener("input", () => { state.query = els.search.value; renderTable(); });
  els.exportBtn.addEventListener("click", exportJson);
  els.importBtn.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", handleImportFile);

  render();
}

init();
