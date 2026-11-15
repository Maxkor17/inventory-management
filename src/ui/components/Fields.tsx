import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import { t } from '@/i18n';
import type { TKey } from '@/i18n';

/** Translates a validation error code (`required`, `duplicate_serial`, ...). */
export const errorText = (code: string | undefined): string => (code ? t(`err.${code}` as TKey) : '');

interface FieldShellProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  span2?: boolean;
  children: (id: string, aria: { 'aria-invalid'?: 'true'; 'aria-describedby'?: string }) => ComponentChildren;
}

function FieldShell({ label, required, hint, error, span2, children }: FieldShellProps) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div class={`field ${span2 ? 'span-2' : ''}`}>
      <label class="field__label" for={id}>
        {label}{required && <span class="field__req" aria-hidden="true">*</span>}
      </label>
      {children(id, error ? { 'aria-invalid': 'true', 'aria-describedby': errId } : {})}
      {hint && !error && <span class="field__hint">{hint}</span>}
      {error && <span class="field__error" id={errId} role="alert">{errorText(error)}</span>}
    </div>
  );
}

interface Common { label: string; required?: boolean; hint?: string; error?: string; span2?: boolean; name?: string }

export function TextField(props: Common & { value: string; onChange: (v: string) => void; type?: 'text' | 'email' | 'tel' | 'date' | 'number'; placeholder?: string; list?: string; autoFocus?: boolean; maxLength?: number }) {
  const { label, required, hint, error, span2, value, onChange, type = 'text', placeholder, list, autoFocus, maxLength, name } = props;
  return (
    <FieldShell label={label} required={required} hint={hint} error={error} span2={span2}>
      {(id, aria) => (
        <input
          id={id} name={name} class="input" type={type} value={value} placeholder={placeholder} list={list} autoFocus={autoFocus}
          maxLength={maxLength} step={type === 'number' ? 'any' : undefined} min={type === 'number' ? 0 : undefined}
          onInput={(e) => onChange((e.currentTarget as HTMLInputElement).value)} {...aria}
        />
      )}
    </FieldShell>
  );
}

export function TextAreaField(props: Common & { value: string; onChange: (v: string) => void; rows?: number }) {
  const { label, required, hint, error, span2, value, onChange, rows, name } = props;
  return (
    <FieldShell label={label} required={required} hint={hint} error={error} span2={span2}>
      {(id, aria) => (
        <textarea id={id} name={name} class="textarea" rows={rows ?? 3} value={value} onInput={(e) => onChange((e.currentTarget as HTMLTextAreaElement).value)} {...aria} />
      )}
    </FieldShell>
  );
}

export interface Option { value: string; label: string }

export function SelectField(props: Common & { value: string; onChange: (v: string) => void; options: readonly Option[]; emptyLabel?: string }) {
  const { label, required, hint, error, span2, value, onChange, options, emptyLabel, name } = props;
  return (
    <FieldShell label={label} required={required} hint={hint} error={error} span2={span2}>
      {(id, aria) => (
        <select id={id} name={name} class="select" value={value} onChange={(e) => onChange((e.currentTarget as HTMLSelectElement).value)} {...aria}>
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </FieldShell>
  );
}

export function CheckField({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label class="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Parses a user-entered number; '' -> null; NaN -> undefined (invalid). */
export function parseCost(s: string): number | null | undefined {
  const v = s.trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
