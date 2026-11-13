import type { ComponentProps } from 'react';
import type { GuitarProfile } from '@guitar3d/shared';
import { Guitar3D } from '../../fretboard/Guitar3D';
import { useActiveGuitar } from '../../guitar-setup/activeGuitar';

type Guitar3DProps = ComponentProps<typeof Guitar3D>;

/**
 * Thin adapter between the screens and the 3D renderer: shows the active guitar (see
 * useActiveGuitar) unless a `profile` is passed. Every other prop, known or not, goes to Guitar3D.
 */
export type StageGuitarProps = Omit<Guitar3DProps, 'profile'> & {
  /** Guitar to show instead of the active one (previews). */
  profile?: GuitarProfile | null;
  [extra: string]: unknown;
};

export function StageGuitar({ profile, ...rest }: StageGuitarProps) {
  const active = useActiveGuitar();
  const shown = profile ?? active.profile;
  if (!shown) return <div className={rest.className} aria-busy={active.loading} />;
  return <Guitar3D {...(rest as Omit<Guitar3DProps, 'profile'>)} profile={shown} />;
}
