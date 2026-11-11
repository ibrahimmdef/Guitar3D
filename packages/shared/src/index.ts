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

export interface FretNote {
  string: number;
  fret: number;
  state: NoteState;
  finger?: number;
}
