import type { SectionPass, SectionProgress, TabProgress } from '@guitar3d/shared';

const pct = (v: number) => `${Math.round(v * 100)}%`;
export const sectionLabel = (s: Pick<SectionProgress, 'startBar' | 'endBar'>) => (s.startBar === s.endBar ? `Bar ${s.startBar + 1}` : `Bars ${s.startBar + 1}–${s.endBar + 1}`);

/** "Clean at 85% — 12 BPM to go" (or "% to go" when the written tempo is unknown). */
export function cleanLabel(s: Pick<SectionProgress, 'bestCleanSpeed' | 'bpm'>, target = 1): string {
  const best = s.bestCleanSpeed;
  if (!best) return 'Not clean yet';
  if (best >= target - 1e-6) return `Clean at ${pct(best)} — up to speed`;
  if (s.bpm) {
    const togo = Math.max(1, Math.round(s.bpm * target) - Math.round(s.bpm * best));
    return `Clean at ${pct(best)} — ${togo} BPM to go`;
  }
  return `Clean at ${pct(best)} — ${Math.round((target - best) * 100)}% to go`;
}

/** The section the player worked on last (passes first, then any saved best speed). */
export function focusSection(p: TabProgress | undefined): SectionProgress | null {
  if (!p?.sections.length) return null;
  return [...p.sections].sort((a, b) => Number(!!b.history?.length) - Number(!!a.history?.length) || b.updatedAt.localeCompare(a.updatedAt))[0];
}

export interface SessionPoint {
  /** Start of the session (ISO). */
  at: string;
  /** Fastest clean pass in the session, or null when none was clean. */
  speed: number | null;
  passes: number;
}

/**
 * Splits a section's pass history into practice sessions (a gap of more than `gapMin` minutes
 * starts a new one) and takes the fastest clean pass of each: the "clean tempo over sessions" line.
 */
export function cleanTempoBySession(history: SectionPass[] | undefined, gapMin = 30): SessionPoint[] {
  const out: SessionPoint[] = [];
  let last = -Infinity;
  for (const p of [...(history ?? [])].sort((a, b) => a.at.localeCompare(b.at))) {
    const t = Date.parse(p.at);
    if (!out.length || t - last > gapMin * 60000) out.push({ at: p.at, speed: null, passes: 0 });
    const cur = out[out.length - 1];
    cur.passes++;
    if (p.clean) cur.speed = Math.max(cur.speed ?? 0, p.speed);
    last = t;
  }
  return out;
}
