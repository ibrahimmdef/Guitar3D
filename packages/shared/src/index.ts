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
}

export type TabFormat = 'gp' | 'gp3' | 'gp4' | 'gp5' | 'gpx' | 'gp7' | 'musicxml' | 'mxl' | 'alphatex' | 'ascii';

export interface SectionProgress {
  startBar: number;
  endBar: number;
  bestCleanSpeed: number;
  updatedAt: string;
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

/** Teacher mode: a text note on a bar of a tab (`tabKey` = tab id or `lesson:<id>`). */
export interface BarNote {
  id: string;
  tabKey: string;
  /** 0-based bar. */
  bar: number;
  text: string;
  createdAt: string;
}

/** Teacher mode: practise `tabKey` up to `targetSpeed` by `due` (YYYY-MM-DD). */
export interface Assignment {
  id: string;
  tabKey: string;
  title: string;
  /** 1 = 100 %. */
  targetSpeed: number;
  due: string;
  note?: string;
  createdAt: string;
}
