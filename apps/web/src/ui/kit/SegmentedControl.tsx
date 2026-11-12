import * as TG from '@radix-ui/react-toggle-group';
import type { ReactNode } from 'react';
import { Tooltip } from './Tooltip';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Show only the icon (label becomes the tooltip / accessible name). */
  iconOnly?: boolean;
  shortcut?: string;
  hint?: string;
}

interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  'aria-label': string;
  size?: 'sm' | 'md';
  className?: string;
}

export function SegmentedControl<T extends string>({ value, onChange, options, size = 'md', className, ...aria }: Props<T>) {
  return (
    <TG.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={aria['aria-label']}
      className={`seg seg-${size}${className ? ` ${className}` : ''}`}
    >
      {options.map((o) => {
        const item = (
          <TG.Item key={o.value} value={o.value} className="seg-item" aria-label={o.iconOnly ? o.label : undefined} aria-keyshortcuts={o.shortcut}>
            {o.icon && <span className="seg-ic" aria-hidden>{o.icon}</span>}
            {!o.iconOnly && <span>{o.label}</span>}
          </TG.Item>
        );
        return o.shortcut || o.hint || o.iconOnly ? (
          <Tooltip key={o.value} content={o.hint ?? o.label} shortcut={o.shortcut} side="bottom">{item}</Tooltip>
        ) : item;
      })}
    </TG.Root>
  );
}
