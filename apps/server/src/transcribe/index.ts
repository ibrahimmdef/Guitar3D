import type { AutoTabInfo, StrumAnalysis, TranscriptionSummary } from '@guitar3d/shared';
import { barOrigin, chooseDownbeat, fixedGrid, quantize, toBars, trackedGrid, SLOTS_PER_BAR, type RawTranscription } from './grid.js';
import { analyzeStrums, applyStrums } from './strum.js';
import { cleanNotes } from './clean.js';
import { buildAlphaTex, groupEvents, LEAD_NAME, placeEvents, RHYTHM_NAME, splitLeadRhythm, type TrackPart } from './tab.js';
import { detectTuning, suggestCapo, tuningLabel } from './tuning.js';

export type { RawNote, RawStrum, RawTranscription } from './grid.js';

export interface BuildOptions {
  title: string;
  artist?: string;
  /** Fixed tempo the player recorded to; replaces the tracked beats. */
  bpm?: number;
  /** Seconds before the first downbeat (count-in) when `bpm` is given. */
  offset?: number;
  /** Notes quieter than this are dropped as noise (default 0.12). */
  minConf?: number;
}

export interface AutoTab {
  tex: string;
  info: AutoTabInfo;
  summary: TranscriptionSummary;
}

/**
 * Raw notes → playable tab: beat grid and 16th quantisation (4/4), tuning and capo detection,
 * lead/rhythm split, string/fret assignment and alphaTex with low-confidence notes listed.
 */
export function buildAutoTab(raw: RawTranscription, opts: BuildOptions): AutoTab {
  const notes = cleanNotes(raw.notes).filter((n) => n.conf >= (opts.minConf ?? 0.12) && n.end > n.start && n.pitch >= 24 && n.pitch <= 100);
  if (!notes.length) throw new Error('No guitar notes were detected.');
  const grid = opts.bpm ? fixedGrid(opts.bpm, opts.offset ?? 0) : trackedGrid(raw.beats, raw.tempo);
  const q = quantize(notes, grid);
  const downbeat = grid.fixedDownbeat ? 0 : chooseDownbeat(q);
  const barred = toBars(q, downbeat, grid.fixedDownbeat);
  if (!barred.length) throw new Error('No guitar notes were detected after the count-in.');

  const events = groupEvents(barred);
  const pitchBeats = events.map((e) => e.notes.map((n) => n.pitch));
  const tuning = detectTuning(barred, pitchBeats);
  const capo = suggestCapo(barred, pitchBeats, tuning.midi);

  let { lead, rhythm } = splitLeadRhythm(events);
  // Strummed rhythm part: every strum with its direction, the chords and the repeating pattern.
  let strum: StrumAnalysis | undefined;
  if (raw.strums?.length && rhythm.length) {
    const barCount = Math.floor(Math.max(...barred.map((n) => n.slot)) / SLOTS_PER_BAR) + 1;
    const found = analyzeStrums({ strums: raw.strums, grid, origin: barOrigin(q, downbeat, grid.fixedDownbeat), barCount, notes, rhythm });
    if (found) {
      strum = found.analysis;
      ({ rhythm, lead } = applyStrums(rhythm, lead, found.strums, found.analysis.bars));
    }
  }
  const parts: TrackPart[] = [];
  let dropped = 0;
  for (const [name, evs] of [[LEAD_NAME, lead], [RHYTHM_NAME, rhythm]] as const) {
    if (!evs.length) continue;
    const placed = placeEvents(evs, tuning.midi, capo);
    dropped += placed.dropped;
    if (placed.events.length) parts.push({ name, events: placed.events });
  }
  if (!parts.length) throw new Error('None of the detected notes can be played on a guitar.');

  const cents = Math.round(raw.cents ?? 0);
  const detected = tuningLabel(tuning, cents, capo);
  const { tex, info } = buildAlphaTex({ title: opts.title, artist: opts.artist, tempo: grid.tempo, tuning: tuning.midi, capo, parts, detected, barCount: strum?.bars.length, strum });
  const last = Math.max(...parts.flatMap((p) => p.events.map((e) => e.slot)));
  return {
    tex,
    info,
    summary: {
      detected,
      tuningId: tuning.id,
      tuning: tuning.midi,
      tuningLabel: tuning.label,
      cents,
      capo,
      tempo: grid.tempo,
      bars: Math.max(strum?.bars.length ?? 0, Math.floor(last / SLOTS_PER_BAR) + 1),
      notes: info.notes,
      lowConfidence: info.low.length,
      dropped,
      tracks: parts.map((p) => p.name),
      ...(strum ? { strum } : {}),
    },
  };
}
