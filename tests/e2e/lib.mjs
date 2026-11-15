import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './serve.mjs';

export const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FALLBACK_CHROME = 'C:\\Users\\maxim\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';

export const OUT = new URL('./.out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

export const results = [];
export function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail: cond ? '' : String(detail) });
  if (!cond) console.log(`  FAIL  ${name}  ${detail}`);
}

export async function launch() {
  const { server, url } = await startServer({ port: 4173 });
  let browser;
  for (const p of [CHROME, FALLBACK_CHROME]) {
    try { browser = await chromium.launch({ executablePath: p, headless: true, args: ['--no-sandbox'] }); break; } catch { /* try next */ }
  }
  if (!browser) throw new Error('Chrome not found');
  return { server, url, browser };
}

/** New isolated browser context (own IndexedDB + localStorage) with console-error capture. */
export async function newPage(browser, { viewport = { width: 1366, height: 900 }, locale = 'en-US', init, colorScheme } = {}) {
  const context = await browser.newContext({ viewport, locale, acceptDownloads: true, colorScheme });
  const errors = [];
  if (init) await context.addInitScript(init.fn, init.arg);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('dialog', (d) => d.accept()); // no native dialogs are expected; accept to avoid hangs
  return { context, page, errors };
}

export async function readStore(page, store) {
  return page.evaluate((name) => new Promise((resolve, reject) => {
    const open = indexedDB.open('inventory-management-itam');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror = () => reject(req.error);
    };
  }), store);
}

export async function readMeta(page, key) {
  const rows = await readStore(page, 'meta');
  return rows.find((r) => r.key === key)?.value;
}

export async function saveDownload(download, name) {
  const p = join(OUT, name);
  await download.saveAs(p);
  return p;
}
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const readText = (p) => readFileSync(p, 'utf8');
export const writeFixture = (name, text) => { const p = join(OUT, name); writeFileSync(p, text, 'utf8'); return p; };

export async function noHorizontalOverflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, ok: de.scrollWidth <= de.clientWidth + 1 };
  });
}
