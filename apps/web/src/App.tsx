import { AppShell } from './screens/AppShell';
import { ChordsScreen } from './screens/chords/ChordsScreen';
import { GuitarScreen } from './screens/guitar/GuitarScreen';
import { LibraryScreen } from './screens/library/LibraryScreen';
import { ScalesScreen } from './screens/scales/ScalesScreen';
import { TunerScreen } from './screens/tuner/TunerScreen';
import { ProgressScreen } from './screens/progress/ProgressScreen';
import { ChordTrainerScreen } from './screens/games/ChordTrainerScreen';
import { CourseScreen } from './screens/course/CourseScreen';
import { EditorScreen } from './screens/editor/EditorScreen';
import { EarScreen } from './screens/games/EarScreen';
import { FretGameScreen } from './screens/games/FretGameScreen';
import { RhythmScreen } from './screens/rhythm/RhythmScreen';
import { RoutineBar } from './screens/routines/RoutineBar';
import { RoutinesScreen } from './screens/routines/RoutinesScreen';
import { PlayerScreen } from './screens/player/PlayerScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { ToastProvider, TooltipProvider } from './ui/kit';
import { useRoute } from './ui/router';
import { useA11yEffect, useSettings, useThemeEffect } from './ui/settings';

export function App() {
  const route = useRoute();
  const [settings] = useSettings();
  useThemeEffect(settings.theme);
  useA11yEffect(settings);

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
            {route.name === 'tuner' && <TunerScreen />}
            {route.name === 'routines' && <RoutinesScreen />}
            {route.name === 'progress' && <ProgressScreen />}
            {route.name === 'rhythm' && <RhythmScreen />}
            {route.name === 'fretboard-game' && <FretGameScreen />}
            {route.name === 'chord-trainer' && <ChordTrainerScreen />}
            {route.name === 'ear' && <EarScreen />}
            {route.name === 'course' && <CourseScreen />}
            {route.name === 'editor' && <EditorScreen />}
          </AppShell>
        )}
        <RoutineBar route={route} />
      </ToastProvider>
    </TooltipProvider>
  );
}
