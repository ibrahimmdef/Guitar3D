import { lazy, Suspense, useEffect } from 'react';
import { AppShell } from './screens/AppShell';
import { LibraryScreen } from './screens/library/LibraryScreen';
import { OfflineIndicator } from './pwa/OfflineIndicator';
import { BadgeWatcher } from './screens/progress/BadgeWatcher';
import { ArrowLeft } from 'lucide-react';
import { IconButton, ToastProvider, TooltipProvider } from './ui/kit';
import { navigate, useRoute } from './ui/router';
import { useA11yEffect, useSettings, useThemeEffect } from './ui/settings';
import { LoadingProgress } from './ui/LoadingProgress';

// Screens load on demand: the library opens without downloading the 3D engine and the tab renderer.
const ChordsScreen = lazy(() => import('./screens/chords/ChordsScreen').then((m) => ({ default: m.ChordsScreen })));
const GuitarScreen = lazy(() => import('./screens/guitar/GuitarScreen').then((m) => ({ default: m.GuitarScreen })));
const ScalesScreen = lazy(() => import('./screens/scales/ScalesScreen').then((m) => ({ default: m.ScalesScreen })));
const TunerScreen = lazy(() => import('./screens/tuner/TunerScreen').then((m) => ({ default: m.TunerScreen })));
const ProgressScreen = lazy(() => import('./screens/progress/ProgressScreen').then((m) => ({ default: m.ProgressScreen })));
const EditorScreen = lazy(() => import('./screens/editor/EditorScreen').then((m) => ({ default: m.EditorScreen })));
const PlayerScreen = lazy(() => import('./screens/player/PlayerScreen').then((m) => ({ default: m.PlayerScreen })));
const SettingsScreen = lazy(() => import('./screens/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));

/** Same steps as the player's own loading screen, so opening a tab shows one continuous bar. */
const PLAYER_FALLBACK = (
  <div className="load-screen">
    <IconButton className="load-screen-back" label="Back to library" icon={<ArrowLeft size={18} />} onClick={() => navigate({ name: 'library' })} />
    <LoadingProgress steps={[{ label: 'Loading tab', progress: 0.05 }, { label: 'Building your guitar', progress: 0, weight: 2 }, { label: 'Loading sounds', progress: 0, weight: 2 }]} />
  </div>
);

/** Fetch the player (3D guitar + tab engine) in the background once the first screen is up. */
const prefetchPlayer = () => import('./screens/player/PlayerScreen');

export function App() {
  const route = useRoute();
  const [settings] = useSettings();
  useThemeEffect(settings.theme);
  useA11yEffect(settings);
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    idle(() => void prefetchPlayer());
  }, []);

  return (
    <TooltipProvider>
      <ToastProvider>
        {route.name === 'player' ? (
          <Suspense fallback={PLAYER_FALLBACK}>
          <PlayerScreen key={`${route.source.kind}:${route.source.id}`} source={route.source} share={route.share} />
          </Suspense>
        ) : (
          <AppShell route={route}>
            <Suspense fallback={null}>
            {route.name === 'library' && <LibraryScreen />}
            {route.name === 'guitar' && <GuitarScreen />}
            {route.name === 'settings' && <SettingsScreen />}
            {route.name === 'chords' && <ChordsScreen />}
            {route.name === 'scales' && <ScalesScreen />}
            {route.name === 'tuner' && <TunerScreen />}
            {route.name === 'progress' && <ProgressScreen />}
            {route.name === 'editor' && <EditorScreen />}
            </Suspense>
          </AppShell>
        )}
        <OfflineIndicator />
        <BadgeWatcher />
      </ToastProvider>
    </TooltipProvider>
  );
}
