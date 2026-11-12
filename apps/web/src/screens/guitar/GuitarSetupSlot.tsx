import { useCallback, useEffect, useState } from 'react';
import { api as server } from '../../api';
import { GuitarPhotos } from '../../ui/GuitarPhotos';

/**
 * INTEGRATION POINT (workstream B).
 *
 * Placeholder for B's `GuitarSetupWizard` (apps/web/src/guitar-setup/). The guitar screen renders
 * it inside a Sheet as <GuitarSetupSlot onDone onCancel />. When B lands, replace the body with
 *
 *   return <GuitarSetupWizard onDone={onDone} onCancel={onCancel} />;
 *
 * (adapting prop names). `onDone(id)` should receive the saved guitar's id so the list refreshes.
 * Until then it shows the legacy fretboard/body photo calibration.
 */
export interface GuitarSetupSlotProps {
  onDone: (guitarId?: string) => void;
  onCancel: () => void;
}

export function GuitarSetupSlot(_props: GuitarSetupSlotProps) {
  const [textures, setTextures] = useState<Record<string, string | null>>({});
  const refresh = useCallback(() => {
    server.guitarAssets().then((a) => setTextures(a.textures)).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);
  return (
    <GuitarPhotos
      textures={textures}
      onChanged={refresh}
    />
  );
}
