/** Triggers a browser download of text content. CSV gets a UTF-8 BOM so Excel reads Cyrillic correctly. */
export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const bom = mime.startsWith('text/csv') ? '﻿' : '';
  const blob = new Blob([bom + text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const downloadCsv = (filename: string, text: string): void => downloadText(filename, text, 'text/csv');

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsText(file);
  });
}

export const stamp = (): string => new Date().toISOString().slice(0, 10);
