export interface TabMeta {
  id: string;
  title: string;
  artist: string;
  fileName: string;
  uploadedAt: string;
}

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

export * from './guitar';
