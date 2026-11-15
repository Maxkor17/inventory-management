import type { ComponentChildren, JSX } from 'preact';

type Variant = 'primary' | 'secondary' | 'danger' | 'danger-solid' | 'ghost';

type ButtonAttrs = JSX.IntrinsicElements['button'];
type AnchorAttrs = JSX.IntrinsicElements['a'];

const classes = (variant: Variant, small: boolean | undefined, iconOnly: boolean | undefined, extra: unknown): string =>
  ['btn', `btn--${variant}`, small ? 'btn--sm' : '', iconOnly ? 'btn--icon' : '', typeof extra === 'string' ? extra : ''].filter(Boolean).join(' ');

export function Button({ variant = 'secondary', small, iconOnly, class: cls, type = 'button', children, ...rest }: ButtonAttrs & {
  variant?: Variant; small?: boolean; iconOnly?: boolean; children?: ComponentChildren;
}) {
  return <button {...rest} type={type as 'button'} class={classes(variant, small, iconOnly, cls)}>{children}</button>;
}

/** Anchor styled as a button (for navigation). */
export function ButtonLink({ variant = 'secondary', small, class: cls, children, ...rest }: AnchorAttrs & {
  variant?: Variant; small?: boolean; children?: ComponentChildren;
}) {
  return <a {...rest} class={classes(variant, small, false, cls)}>{children}</a>;
}
