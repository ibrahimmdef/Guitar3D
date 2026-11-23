import type { StrumAnalysis } from './strum';

export interface TabMeta {
  id: string;
  title: string;
  artist: string;
  fileName: string;
  uploadedAt: string;
  /** Source format: 'gp3' | 'gp4' | 'gp5' | 'gpx' | 'gp7' | 'gp' | 'musicxml' | 'mxl' | 'alphatex' | 'ascii'. */
  format?: TabFormat;
  /** ISO time of the last `POST /api/tabs/:id/played`. */
  lastPlayedAt?: string;
  /** Set on tabs made by auto-transcription (`/api/transcriptions`). */
  transcription?: TabTranscriptionInfo;
}

/** Where an auto-transcribed tab came from and how sure the transcription is. */
export interface TabTranscriptionInfo {
  jobId: string;
  source: TranscriptionSource;
  songId?: string;
  /** e.g. "Eb standard (½ step down)". */
  detected: string;
  notes: number;
  lowConfidence: number;
}

export type TabFormat = 'gp' | 'gp3' | 'gp4' | 'gp5' | 'gpx' | 'gp7' | 'musicxml' | 'mxl' | 'alphatex' | 'ascii';

/** One speed-trainer pass through a section (`POST /api/progress/:tabId/passes`). */
export interface SectionPass {
  /** ISO time. */
  at: string;
  /** Playback speed of the pass (1 = written tempo). */
  speed: number;
  clean: boolean;
  /** Scored pass (microphone): clean notes in %. Missing for manual "Clean / Not clean" passes. */
  score?: number;
  mode: 'mic' | 'manual';
}

export interface SectionProgress {
  startBar: number;
  endBar: number;
  bestCleanSpeed: number;
  updatedAt: string;
  /** Written tempo of the section in BPM (for "12 BPM to go"). */
  bpm?: number;
  /** Speed-trainer passes, oldest first (capped on the server). */
  history?: SectionPass[];
}

export interface TabProgress {
  tabId: string;
  sections: SectionProgress[];
}

export type NoteState = 'now' | 'next';

/** Fraction of the time until the next note has elapsed, 0..1 (drives the approach ring of 'next' notes). */
export type BeatProgress = number;

export interface FretNote {
  /** Tab numbering: 1 = high e … 6 = low E. */
  string: number;
  /** 0 = open string. */
  fret: number;
  state: NoteState;
  /** Left-hand finger 1–4 (0 = thumb) when the tab provides it. */
  finger?: number;
  /** Dead/muted note (x in the tab). */
  muted?: boolean;
  /** Technique hints drawn on the bubble. */
  technique?: 'hammer' | 'pull' | 'slide' | 'bend' | 'harmonic';
  /** Speed-trainer feedback: the note was missed, late or early (drawn in that colour). */
  tone?: 'missed' | 'late' | 'early';
}

/** What a practice session was spent on. */
export type SessionKind = 'tab' | 'lesson' | 'routine' | 'chords' | 'scales';

/** One practice session (`GET/POST /api/sessions`). */
export interface PracticeSession {
  id: string;
  kind: SessionKind;
  /** Tab id, lesson id or routine id. */
  refId?: string;
  title: string;
  /** ISO times. */
  startedAt: string;
  endedAt: string;
  /** Active practice time in seconds (playing / listening / routine timer). */
  seconds: number;
  /** Best playback speed that was played cleanly (1 = 100 %). */
  bestCleanSpeed?: number;
  /** Best listen-mode pass accuracy, 0..100. */
  accuracy?: number;
}

export type NewPracticeSession = Omit<PracticeSession, 'id'>;

export * from './guitar';

/** A text note on a bar of a tab (`tabKey` = tab id or `lesson:<id>`). */
export interface BarNote {
  id: string;
  tabKey: string;
  /** 0-based bar. */
  bar: number;
  text: string;
  createdAt: string;
}

/** Stems produced by the separator (Demucs htdemucs_6s), in mixer order. */
export const STEM_NAMES = ['guitar', 'vocals', 'bass', 'drums', 'piano', 'other'] as const;
export type StemName = (typeof STEM_NAMES)[number];

export type SongStatus = 'queued' | 'downloading' | 'separating' | 'ready' | 'error';

/** An audio song split into stems (`/api/songs`). Files live in data/songs/<id>/. */
export interface Song {
  id: string;
  title: string;
  artist: string;
  /** Original upload inside the song folder. */
  fileName: string;
  /** Seconds (from ffprobe). */
  duration?: number;
  uploadedAt: string;
  status: SongStatus;
  /** Separation progress 0..1 (meaningful while 'separating'). */
  progress: number;
  /** Human readable reason when status is 'error'. */
  error?: string;
  /** Stems available for playback once 'ready'. */
  stems: StemName[];
  /** Wall-clock seconds the last successful separation took. */
  separationSeconds?: number;
  /** Page the audio was downloaded from ("From link"); absent for uploaded files. */
  sourceUrl?: string;
  /** The downloaded original was deleted after separation (data retention); the stems stay. */
  originalDeleted?: boolean;
}

/** `GET /api/songs/separator`: whether stem separation can run on this machine. */
export interface SeparatorStatus {
  available: boolean;
  /** Why not, e.g. Demucs / ffmpeg not installed. */
  reason?: string;
  /** Command or steps that fix it. */
  setupHint?: string;
  /** Whether "Add a song from a link" (yt-dlp) works on this server. */
  linkImport?: LinkImportStatus;
}

/** Link import (yt-dlp) availability, reported inside `SeparatorStatus`. */
export interface LinkImportStatus {
  available: boolean;
  reason?: string;
  setupHint?: string;
}

// ---- auto-transcription -------------------------------------------------------------------

export type TranscriptionSource = 'song' | 'recording';
export type TranscriptionStatus = 'queued' | 'running' | 'ready' | 'error';

/** What the post-processing found (`TranscriptionJob.summary`). */
export interface TranscriptionSummary {
  /** Human readable tuning / capo line, e.g. "Eb standard (½ step down) · capo 2". */
  detected: string;
  /** Tuning id ('standard', 'half-down', 'drop-d', 'd-standard', 'drop-c#'…) and its MIDI pitches (tab order). */
  tuningId: string;
  tuning: number[];
  tuningLabel: string;
  /** Global detune in cents left after the tuning (e.g. -30 = a bit flat). */
  cents: number;
  capo: number;
  tempo: number;
  bars: number;
  notes: number;
  lowConfidence: number;
  /** Detected notes that could not be placed on the neck (out of range) and were left out. */
  dropped: number;
  /** Track names in the tab, e.g. ["Lead / riff", "Rhythm"]. */
  tracks: string[];
  /** Strum directions, chords and the repeating strum pattern of the rhythm part (when it is strummed). */
  strum?: StrumAnalysis;
}

/** One transcription job (`/api/transcriptions`): a song's guitar stem or a microphone recording → tab. */
export interface TranscriptionJob {
  id: string;
  source: TranscriptionSource;
  songId?: string;
  title: string;
  createdAt: string;
  status: TranscriptionStatus;
  progress: number;
  error?: string;
  /** The library tab once 'ready'. */
  tabId?: string;
  /** Tempo the player recorded to (recordings with a metronome); replaces beat tracking. */
  bpm?: number;
  /** Seconds from the start of the recording to the first downbeat (after the count-in). */
  offset?: number;
  summary?: TranscriptionSummary;
  /** Wall-clock seconds the job took. */
  seconds?: number;
}

/** `GET /api/transcriptions/status`. */
export type TranscriberStatus = SeparatorStatus;

/**
 * Auto-transcribed alphaTex starts with this comment line followed by JSON (`AutoTabInfo`). The
 * player reads it to colour notes that may be wrong.
 */
export const AUTO_TEX_TAG = '// guitar3d-auto ';

export interface AutoTabInfo {
  v: 1;
  detected: string;
  notes: number;
  /** Low-confidence notes: [track index, bar index, beat index in the bar, tab string (1 = high e)]. */
  low: [number, number, number, number][];
  /** Strum pattern of the "Rhythm" track (bars match the tab's bars). */
  strum?: StrumAnalysis;
  /**
   * Start of every bar in the source audio, in seconds (one more entry than bars: the last is the
   * end of the last bar). Lets the player follow the real song instead of a fixed tempo.
   */
  barTimes?: number[];
}

/** Bar start times of an auto tab: the dedicated list, else the strum analysis' (older tabs). */
export function autoBarTimes(info: AutoTabInfo | null | undefined): number[] | null {
  const t = info?.barTimes ?? info?.strum?.barTimes;
  return t && t.length >= 2 ? t : null;
}

/** The `AutoTabInfo` header of an auto-transcribed alphaTex, or null for any other text. */
export function readAutoTabInfo(text: string): AutoTabInfo | null {
  const start = text.indexOf(AUTO_TEX_TAG);
  if (start < 0 || text.slice(0, start).trim()) return null;
  const end = text.indexOf('\n', start);
  try {
    const info = JSON.parse(text.slice(start + AUTO_TEX_TAG.length, end < 0 ? undefined : end)) as AutoTabInfo;
    return info && info.v === 1 && Array.isArray(info.low) ? info : null;
  } catch {
    return null;
  }
}

export * from './fingering';
export * from './chords';
export * from './strum';
