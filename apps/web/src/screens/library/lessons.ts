import { DEMO_TEX } from '../../demoTab';

/**
 * Built-in lessons.
 *
 * INTEGRATION POINT (workstream B): B adds `listBuiltinLessons()` and `loadBuiltinLesson(id)` in
 * apps/web/src/tabs/builtin. We load that module lazily through `import.meta.glob`, which yields
 * nothing while the module does not exist, so this file compiles and works on its own and falls
 * back to the small set below. B's return shapes are normalised defensively (see `toLessonMeta`
 * and `toLessonContent`).
 */

export type LessonLevel = 'beginner' | 'intermediate' | 'advanced';

export const LEVEL_LABEL: Record<LessonLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};
export const LEVELS: LessonLevel[] = ['beginner', 'intermediate', 'advanced'];

export interface LessonMeta {
  id: string;
  title: string;
  level: LessonLevel;
  description?: string;
  tempo?: number;
  /** 'turkuler' = the Turkish folk-style pack, 'eserler' = the classical pieces pack (own library sections). */
  group?: string;
  /** Raw 1–5 level of built-in lessons; the "Classics" section uses it to tell 4 (upper intermediate) from 5 (hard). */
  rank?: number;
}

/** Sub-levels of the "Classics" pack (built-in levels 3–5). */
export const ESER_LEVELS: { rank: number; label: string }[] = [
  { rank: 3, label: 'Intermediate' },
  { rank: 4, label: 'Upper intermediate' },
  { rank: 5, label: 'Hard' },
];

/** Groups pack pieces by their raw 1–5 level, in the order of `ESER_LEVELS`; empty groups are dropped. */
export function groupByRank<T extends { rank?: number }>(items: T[]): { rank: number; label: string; items: T[] }[] {
  return ESER_LEVELS.map((l) => ({ ...l, items: items.filter((i) => i.rank === l.rank) })).filter((g) => g.items.length > 0);
}

export type LessonContent = { kind: 'tex'; tex: string } | { kind: 'buffer'; data: ArrayBuffer };

/** Lesson opened by the old "demo" link. */
export const DEFAULT_LESSON_ID = 'warmup';

const TUNING = '\\track "Acoustic Guitar"\n\\staff {tabs}\n\\tuning e4 b3 g3 d3 a2 e2';

const FALLBACK: (LessonMeta & { tex: string })[] = [
  {
    id: 'open-strings',
    title: 'Open strings',
    level: 'beginner',
    tempo: 70,
    description: 'Get to know the six strings: each string four times, with downstrokes.',
    tex: `\\title "Open strings"\n\\tempo 70\n.\n${TUNING}\n:4 0.6 0.6 0.6 0.6 | 0.5 0.5 0.5 0.5 | 0.4 0.4 0.4 0.4 | 0.3 0.3 0.3 0.3 | 0.2 0.2 0.2 0.2 | 0.1 0.1 0.1 0.1 | 0.1 0.2 0.3 0.4 | 0.5 0.6 0.6 0.6`,
  },
  {
    id: 'spider',
    title: 'Spider exercise 1-2-3-4',
    level: 'beginner',
    tempo: 66,
    description: 'One finger per fret. For fretting-hand strength and independence.',
    tex: `\\title "Spider exercise 1-2-3-4"\n\\tempo 66\n.\n${TUNING}\n:8 1.6 2.6 3.6 4.6 1.5 2.5 3.5 4.5 | 1.4 2.4 3.4 4.4 1.3 2.3 3.3 4.3 | 1.2 2.2 3.2 4.2 1.1 2.1 3.1 4.1 | 4.1 3.1 2.1 1.1 4.2 3.2 2.2 1.2 | 4.3 3.3 2.3 1.3 4.4 3.4 2.4 1.4 | 4.5 3.5 2.5 1.5 4.6 3.6 2.6 1.6`,
  },
  {
    id: 'em-am',
    title: 'First chords: Em and Am',
    level: 'beginner',
    tempo: 72,
    description: 'Clean changes between two easy chords.',
    tex: `\\title "First chords: Em and Am"\n\\tempo 72\n.\n${TUNING}\n:2 (0.6 2.5 2.4 0.3 0.2 0.1) (0.6 2.5 2.4 0.3 0.2 0.1) | (0.5 2.4 2.3 1.2 0.1) (0.5 2.4 2.3 1.2 0.1) | (0.6 2.5 2.4 0.3 0.2 0.1) (0.5 2.4 2.3 1.2 0.1) | (0.6 2.5 2.4 0.3 0.2 0.1).1`,
  },
  {
    id: DEFAULT_LESSON_ID,
    title: 'Warm-up Étude',
    level: 'intermediate',
    tempo: 84,
    description: 'Arpeggios, hammer-ons, slides and chords: try out every feature of the app.',
    tex: DEMO_TEX,
  },
];

const LEVEL_ALIASES: Record<string, LessonLevel> = {
  // Built-in lessons use a 1–5 scale: 1–2 beginner, 3 intermediate, 4–5 advanced.
  beginner: 'beginner', basic: 'beginner', easy: 'beginner', '1': 'beginner', '2': 'beginner',
  intermediate: 'intermediate', medium: 'intermediate', '3': 'intermediate',
  advanced: 'advanced', hard: 'advanced', '4': 'advanced', '5': 'advanced',
};

export function normalizeLevel(v: unknown): LessonLevel {
  return LEVEL_ALIASES[String(v ?? '').trim().toLowerCase()] ?? 'beginner';
}

export function toLessonMeta(x: unknown): LessonMeta | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const id = o.id ?? o.slug;
  if (typeof id !== 'string' || !id) return null;
  return {
    id,
    title: typeof o.title === 'string' && o.title ? o.title : typeof o.name === 'string' ? o.name : id,
    level: normalizeLevel(o.level ?? o.difficulty),
    description: typeof o.description === 'string' ? o.description : undefined,
    tempo: typeof o.tempo === 'number' ? o.tempo : typeof o.bpm === 'number' ? o.bpm : undefined,
    ...(typeof o.group === 'string' ? { group: o.group } : {}),
    ...(typeof o.level === 'number' ? { rank: o.level } : {}),
  };
}

/** Accepts alphaTex strings, binary data, or objects wrapping either. */
export function toLessonContent(x: unknown): LessonContent | null {
  if (typeof x === 'string') return x.trim() ? { kind: 'tex', tex: x } : null;
  if (x instanceof ArrayBuffer) return { kind: 'buffer', data: x };
  if (ArrayBuffer.isView(x)) return { kind: 'buffer', data: x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength) as ArrayBuffer };
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    for (const k of ['tex', 'alphaTex', 'alphatex', 'source', 'content']) if (typeof o[k] === 'string') return toLessonContent(o[k]);
    for (const k of ['data', 'buffer', 'bytes', 'file']) if (o[k] != null) return toLessonContent(o[k]);
  }
  return null;
}

export function groupByLevel<T extends { level: LessonLevel }>(items: T[]): { level: LessonLevel; items: T[] }[] {
  return LEVELS.map((level) => ({ level, items: items.filter((i) => i.level === level) })).filter((g) => g.items.length > 0);
}

type BuiltinModule = {
  listBuiltinLessons?: () => unknown;
  loadBuiltinLesson?: (id: string) => unknown;
};

const modules = import.meta.glob<BuiltinModule>('../../tabs/builtin/index.{ts,tsx}');

async function builtinModule(): Promise<BuiltinModule | null> {
  const load = Object.values(modules)[0];
  if (!load) return null;
  try {
    return await load();
  } catch {
    return null;
  }
}

export async function listLessons(): Promise<LessonMeta[]> {
  const mod = await builtinModule();
  if (mod?.listBuiltinLessons) {
    try {
      const raw = await mod.listBuiltinLessons();
      const list = (Array.isArray(raw) ? raw : []).map(toLessonMeta).filter((m): m is LessonMeta => !!m);
      if (list.length) return list;
    } catch {
      /* fall through to the built-in fallback */
    }
  }
  return FALLBACK.map(({ tex: _tex, ...m }) => m);
}

/** Unsaved alphaTex opened in the player from an import preview (kept in sessionStorage). */
export const PREVIEW_LESSON_ID = 'onizleme';
const PREVIEW_KEY = 'guitar3d.preview.v1';

export function setPreviewLesson(tex: string, title: string) {
  try {
    sessionStorage.setItem(PREVIEW_KEY, JSON.stringify({ tex, title }));
  } catch {
    /* ignore */
  }
}

export async function loadLesson(id: string): Promise<{ meta: LessonMeta | null; content: LessonContent }> {
  if (id === PREVIEW_LESSON_ID) {
    let p: { tex?: string; title?: string } | null = null;
    try {
      p = JSON.parse(sessionStorage.getItem(PREVIEW_KEY) ?? 'null');
    } catch {
      /* ignore */
    }
    if (!p?.tex) throw new Error('Preview not found. Import the tab again.');
    return { meta: { id, title: p.title || 'Preview', level: 'beginner' }, content: { kind: 'tex', tex: p.tex } };
  }
  const mod = await builtinModule();
  if (mod?.loadBuiltinLesson) {
    try {
      const raw = await mod.loadBuiltinLesson(id);
      const content = toLessonContent(raw);
      if (content) {
        const meta = toLessonMeta(raw) ?? (await listLessons()).find((l) => l.id === id) ?? null;
        return { meta, content };
      }
    } catch {
      /* try the fallback set */
    }
  }
  const f = FALLBACK.find((l) => l.id === id);
  if (!f) throw new Error('Lesson not found.');
  const { tex, ...meta } = f;
  return { meta, content: { kind: 'tex', tex } };
}
