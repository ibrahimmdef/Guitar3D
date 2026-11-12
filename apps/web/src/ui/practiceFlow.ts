/**
 * The practice loop the player guides people through:
 *   choose a section → slow it down → loop it → climb the tempo ladder.
 */
export type PracticeStep = 'choose' | 'slow' | 'loop' | 'climb';

export const PRACTICE_STEPS: { step: PracticeStep; label: string }[] = [
  { step: 'choose', label: 'Bölüm seç' },
  { step: 'slow', label: 'Yavaşlat' },
  { step: 'loop', label: 'Döngüde çal' },
  { step: 'climb', label: 'Hızlandır' },
];

export interface PracticeState {
  loop: [number, number] | null;
  playing: boolean;
  speed: number;
  /** Speed the tempo ladder is currently at. */
  ladderSpeed: number;
}

export function practiceStep({ loop, playing, speed, ladderSpeed }: PracticeState): PracticeStep {
  if (!loop) return 'choose';
  if (speed > ladderSpeed + 0.001) return 'slow';
  if (!playing) return 'loop';
  return 'climb';
}

/** Next ladder state after a clean or failed run. Three clean runs raise the speed by 5%. */
export function ladderAfter(
  l: { speed: number; clean: number; target: number },
  result: 'clean' | 'stuck',
): { speed: number; clean: number; target: number; leveledUp: boolean } {
  const round = (v: number) => Math.round(v * 100) / 100;
  if (result === 'stuck') return { ...l, speed: Math.max(0.3, round(l.speed - 0.05)), clean: 0, leveledUp: false };
  const clean = l.clean + 1;
  if (clean < 3) return { ...l, clean, leveledUp: false };
  const speed = Math.min(l.target, round(l.speed + 0.05));
  return { ...l, speed, clean: 0, leveledUp: speed > l.speed };
}
