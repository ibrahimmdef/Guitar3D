import type { ComponentProps, ReactNode } from 'react';
import { Tooltip } from './Tooltip';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** Rendered as a toggle (aria-pressed) when defined. */
  pressed?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, iconRight, pressed, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cx('btn', `btn-${variant}`, `btn-${size}`, pressed && 'is-pressed', !children && 'btn-icon-only', className)}
      {...rest}
    >
      {icon && <span className="btn-ic" aria-hidden>{icon}</span>}
      {children != null && <span className="btn-label">{children}</span>}
      {iconRight && <span className="btn-ic" aria-hidden>{iconRight}</span>}
    </button>
  );
}

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  /** Accessible name; also shown as tooltip. */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  pressed?: boolean;
  /** Keyboard shortcut shown in the tooltip, e.g. "Space". */
  shortcut?: string;
  tooltip?: boolean;
  round?: boolean;
}

export function IconButton({ label, icon, variant = 'ghost', size = 'md', pressed, shortcut, tooltip = true, round, className, type = 'button', ...rest }: IconButtonProps) {
  const btn = (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      aria-keyshortcuts={shortcut}
      className={cx('btn', 'icon-btn', `btn-${variant}`, `btn-${size}`, pressed && 'is-pressed', round && 'is-round', className)}
      {...rest}
    >
      <span className="btn-ic" aria-hidden>{icon}</span>
    </button>
  );
  return tooltip ? <Tooltip content={label} shortcut={shortcut}>{btn}</Tooltip> : btn;
}
