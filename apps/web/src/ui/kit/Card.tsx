import type { ComponentProps } from 'react';

interface Props extends ComponentProps<'div'> {
  padded?: boolean;
  /** Raised cards get a shadow; flat cards only a border. */
  elevation?: 'flat' | 'raised';
}

export function Card({ padded = true, elevation = 'flat', className, ...rest }: Props) {
  return <div className={`card card-${elevation}${padded ? ' card-pad' : ''}${className ? ` ${className}` : ''}`} {...rest} />;
}

export function Spinner({ label = 'Yükleniyor' }: { label?: string }) {
  return <span className="spinner" role="progressbar" aria-label={label} />;
}
