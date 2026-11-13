import { AppShell } from './screens/AppShell';
import { ChordsScreen } from './screens/chords/ChordsScreen';
import { GuitarScreen } from './screens/guitar/GuitarScreen';
import { LibraryScreen } from './screens/library/LibraryScreen';
import { ScalesScreen } from './screens/scales/ScalesScreen';
import { PlayerScreen } from './screens/player/PlayerScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { ToastProvider, TooltipProvider } from './ui/kit';
import { useRoute } from './ui/router';
import { useSettings, useThemeEffect } from './ui/settings';

export function App() {
  const route = useRoute();
  const [settings] = useSettings();
  useThemeEffect(settings.theme);

  return (
    <TooltipProvider>
      <ToastProvider>
        {route.name === 'player' ? (
          <PlayerScreen key={`${route.source.kind}:${route.source.id}`} source={route.source} />
        ) : (
          <AppShell route={route}>
            {route.name === 'library' && <LibraryScreen />}
            {route.name === 'guitar' && <GuitarScreen />}
            {route.name === 'settings' && <SettingsScreen />}
            {route.name === 'chords' && <ChordsScreen />}
            {route.name === 'scales' && <ScalesScreen />}
          </AppShell>
        )}
      </ToastProvider>
    </TooltipProvider>
  );
}
