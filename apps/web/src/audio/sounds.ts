/** Guitar sounds available in the bundled General MIDI soundfont (program numbers are 0-based). */
export const GUITAR_SOUNDS = [
  { program: 25, label: 'Steel-string acoustic' },
  { program: 24, label: 'Nylon' },
  { program: 26, label: 'Jazz electric' },
  { program: 27, label: 'Clean electric' },
  { program: 28, label: 'Muted' },
  { program: 29, label: 'Overdrive' },
] as const;

export const soundLabel = (program: number) => GUITAR_SOUNDS.find((s) => s.program === program)?.label ?? 'Guitar';

/** Quick mix presets. */
export type Mix = 'both' | 'guitar' | 'metronome';
export const MIXES: { value: Mix; label: string }[] = [
  { value: 'both', label: 'Guitar + metronome' },
  { value: 'guitar', label: 'Guitar only' },
  { value: 'metronome', label: 'Metronome only' },
];

export function mixOf(guitarOn: boolean, metronomeOn: boolean): Mix | '' {
  if (guitarOn && metronomeOn) return 'both';
  if (guitarOn) return 'guitar';
  if (metronomeOn) return 'metronome';
  return '';
}
