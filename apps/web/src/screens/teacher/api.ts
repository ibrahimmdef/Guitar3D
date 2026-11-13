import type { Assignment, BarNote, PracticeSession } from '@guitar3d/shared';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const teacherApi = {
  notes: (tabKey: string) => fetch(`/api/notes?tabKey=${encodeURIComponent(tabKey)}`).then((r) => json<BarNote[]>(r)),
  addNote: (n: Pick<BarNote, 'tabKey' | 'bar' | 'text'>) => post('/api/notes', n).then((r) => json<BarNote>(r)),
  deleteNote: (id: string) => fetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  assignments: () => fetch('/api/assignments').then((r) => json<Assignment[]>(r)),
  addAssignment: (a: Omit<Assignment, 'id' | 'createdAt'>) => post('/api/assignments', a).then((r) => json<Assignment>(r)),
  deleteAssignment: (id: string) => fetch(`/api/assignments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

/** Session key matching an assignment's tabKey (tab id or `lesson:<id>`). */
export const sessionKey = (s: Pick<PracticeSession, 'kind' | 'refId'>) => (s.kind === 'lesson' ? `lesson:${s.refId}` : s.refId ?? '');

export type AssignmentStatus = 'done' | 'late' | 'open';

export interface AssignmentProgress {
  /** Best clean speed since the assignment was given (null = not practised cleanly yet). */
  best: number | null;
  minutes: number;
  status: AssignmentStatus;
}

/** Progress of one assignment from the practice sessions after it was created. */
export function assignmentProgress(a: Assignment, sessions: PracticeSession[], now = new Date()): AssignmentProgress {
  const mine = sessions.filter((s) => sessionKey(s) === a.tabKey && s.endedAt >= a.createdAt);
  const speeds = mine.map((s) => s.bestCleanSpeed).filter((v): v is number => typeof v === 'number');
  const best = speeds.length ? Math.max(...speeds) : null;
  const minutes = Math.round(mine.reduce((t, s) => t + s.seconds, 0) / 60);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const status: AssignmentStatus = best != null && best >= a.targetSpeed ? 'done' : a.due < today ? 'late' : 'open';
  return { best, minutes, status };
}
