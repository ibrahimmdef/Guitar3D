import type { PlaySource } from './router';

/**
 * Share links: `#/share?tab=<id>` or `?lesson=<id>`, plus optional `g` (guitar id), `loop=3-6`
 * (1-based bars) and `speed=80` (%). Built-in lessons work on
 * any Guitar3D; uploaded tabs and custom guitars only on the server they live on.
 */
export interface ShareParams {
  source: PlaySource;
  guitarId?: string;
  /** 0-based bars. */
  loop?: [number, number];
  speed?: number;
}

export function buildShareHash(p: ShareParams): string {
  const q = new URLSearchParams();
  q.set(p.source.kind === 'lesson' ? 'lesson' : 'tab', p.source.id);
  if (p.guitarId) q.set('g', p.guitarId);
  if (p.loop) q.set('loop', p.loop[0] === p.loop[1] ? String(p.loop[0] + 1) : `${p.loop[0] + 1}-${p.loop[1] + 1}`);
  if (p.speed && p.speed !== 1) q.set('speed', String(Math.round(p.speed * 100)));
  return `#/share?${q.toString()}`;
}

export function parseShareQuery(query: string): ShareParams | null {
  const q = new URLSearchParams(query);
  const lesson = q.get('lesson');
  const tab = q.get('tab');
  const source: PlaySource | null = lesson ? { kind: 'lesson', id: lesson } : tab ? { kind: 'tab', id: tab } : null;
  if (!source) return null;
  const out: ShareParams = { source };
  const g = q.get('g');
  if (g && /^[\w-]{1,80}$/.test(g)) out.guitarId = g;
  const loop = /^(\d{1,4})(?:-(\d{1,4}))?$/.exec(q.get('loop') ?? '');
  if (loop) {
    const a = Number(loop[1]) - 1;
    const b = Number(loop[2] ?? loop[1]) - 1;
    if (a >= 0 && b >= a) out.loop = [a, b];
  }
  const speed = Number(q.get('speed'));
  if (speed >= 25 && speed <= 150) out.speed = speed / 100;
  return out;
}
