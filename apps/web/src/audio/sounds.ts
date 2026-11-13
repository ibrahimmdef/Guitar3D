/** Guitar sounds available in the bundled General MIDI soundfont (program numbers are 0-based). */
export const GUITAR_SOUNDS = [
  { program: 25, label: 'Çelik telli akustik' },
  { program: 24, label: 'Naylon' },
  { program: 26, label: 'Caz elektro' },
  { program: 27, label: 'Temiz elektro' },
  { program: 28, label: 'Susturulmuş' },
  { program: 29, label: 'Overdrive' },
] as const;

export const soundLabel = (program: number) => GUITAR_SOUNDS.find((s) => s.program === program)?.label ?? 'Gitar';

/** Quick mix presets. */
export type Mix = 'both' | 'guitar' | 'metronome';
export const MIXES: { value: Mix; label: string }[] = [
  { value: 'both', label: 'Gitar + metronom' },
  { value: 'guitar', label: 'Sadece gitar' },
  { value: 'metronome', label: 'Sadece metronom' },
];

export function mixOf(guitarOn: boolean, metronomeOn: boolean): Mix | '' {
  if (guitarOn && metronomeOn) return 'both';
  if (guitarOn) return 'guitar';
  if (metronomeOn) return 'metronome';
  return '';
}
