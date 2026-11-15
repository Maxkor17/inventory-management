"use strict";

/* ===== Constants ===== */
const STORAGE_KEY = "inventoryManagement.devices.v1";
const EXPORT_VERSION = 1;

const DEMO_DEVICES = [
  { name: "Laptop", model: "Dell Latitude 5420", serial: "DL-5420-0001", owner: "Olena Kovalenko" },
  { name: "Monitor", model: "LG UltraFine 27UN850", serial: "LG-27UN-0042", owner: "Andrii Shevchenko" },
  { name: "Network switch", model: "Cisco Catalyst 2960", serial: "CS-2960-0107", owner: "" },
  { name: "Printer", model: "HP LaserJet Pro M404", serial: "HP-M404-0233", owner: "Olena Kovalenko" }
];

/* ===== State ===== */
const state = {
  devices: [],
  query: "",
  editingId: null
};

/* ===== DOM ===== */
const $ = (id) => document.getElementById(id);
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
  fields: {
    name: $("f-name"),
    model: $("f-model"),
    serial: $("f-serial"),
    owner: $("f-owner")
  },
  errors: {
    name: $("e-name"),
    model: $("e-model"),
    serial: $("e-serial"),
    owner: $("e-owner")
  }
};

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

/* ===== Storage ===== */
function saveDevices() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.devices));
    return true;
  } catch (err) {
    showNotice("Could not save data to LocalStorage (storage may be full or disabled). Changes will be lost on reload. Use Export JSON to keep a copy.", "error");
    return false;
  }
}

/* Validates a record from storage/import. Returns a clean record or null. */
function cleanRecord(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { name, model, serial } = raw;
  const owner = raw.owner === undefined || raw.owner === null ? "" : raw.owner;
  if (typeof name !== "string" || typeof model !== "string" ||
      typeof serial !== "string" || typeof owner !== "string") return null;
  if (!name.trim() || !model.trim() || !serial.trim()) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    name: name.trim(),
    model: model.trim(),
    serial: serial.trim(),
    owner: owner.trim()
  };
}

function loadDevices() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    showNotice("LocalStorage is unavailable. Data will not be saved between sessions.", "error");
    return [];
  }

  // First run: no data yet -> seed demo records (never when data exists).
  if (raw === null) {
    state.devices = DEMO_DEVICES.map((d) => ({ id: newId(), ...d }));
    saveDevices();
    return state.devices;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Not an array");
    const seen = new Set();
    const devices = [];
    for (const item of parsed) {
      const rec = cleanRecord(item);
      if (rec && !seen.has(normSerial(rec.serial))) {
        seen.add(normSerial(rec.serial));
        devices.push(rec);
      }
    }
    return devices;
  } catch (err) {
    // Keep the unreadable data under another key so it is not lost.
    try { localStorage.setItem(STORAGE_KEY + ".corrupt", raw); } catch (e) { /* ignore */ }
    showNotice("Stored data was unreadable and could not be loaded. A copy was kept under the key \"" + STORAGE_KEY + ".corrupt\". Starting with an empty list.", "error");
    return [];
  }
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
    [d.name, d.model, d.serial, d.owner].some((v) => v.toLowerCase().includes(q))
  );
}

function makeCell(label, text, className) {
  const td = document.createElement("td");
  td.dataset.label = label;
  td.textContent = text;
  if (className) td.className = className;
  return td;
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
  els.rows.textContent = "";

  for (const d of visible) {
    const tr = document.createElement("tr");
    if (d.id === state.editingId) tr.className = "editing";
    tr.appendChild(makeCell("Name", d.name));
    tr.appendChild(makeCell("Model", d.model));
    tr.appendChild(makeCell("Serial number", d.serial));
    tr.appendChild(d.owner
      ? makeCell("Responsible", d.owner)
      : makeCell("Responsible", "Unassigned", "unassigned"));

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
function clearErrors() {
  for (const key of Object.keys(els.errors)) {
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
  els.fields.name.value = d.name;
  els.fields.model.value = d.model;
  els.fields.serial.value = d.serial;
  els.fields.owner.value = d.owner;
  els.formTitle.textContent = "Edit device";
  els.submitBtn.textContent = "Save changes";
  els.cancelBtn.hidden = false;
  renderTable();
  els.form.scrollIntoView({ behavior: "smooth", block: "start" });
  els.fields.name.focus();
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
  return valid;
}

function handleSubmit(event) {
  event.preventDefault();
  hideNotice();

  const values = {
    name: els.fields.name.value.trim(),
    model: els.fields.model.value.trim(),
    serial: els.fields.serial.value.trim(),
    owner: els.fields.owner.value.trim()
  };
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
    a.download = "inventory-" + new Date().toISOString().slice(0, 10) + ".json";
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

  const list = Array.isArray(data) ? data : (data && Array.isArray(data.devices) ? data.devices : null);
  if (!list) throw new Error("Invalid structure: expected an array of devices or an object with a \"devices\" array.");

  const records = [];
  const problems = [];
  list.forEach((item, i) => {
    const rec = cleanRecord(item);
    if (rec) records.push(rec);
    else problems.push("#" + (i + 1));
  });

  if (problems.length) {
    const shown = problems.slice(0, 10).join(", ") + (problems.length > 10 ? ", ..." : "");
    throw new Error("Invalid records (name, model and serial must be non-empty text; owner must be text): " + shown + ". Nothing was imported.");
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
