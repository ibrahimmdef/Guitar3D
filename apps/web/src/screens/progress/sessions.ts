import type { NewPracticeSession, PracticeSession } from '@guitar3d/shared';
import { addSession, listSessions as list } from '../../storage/library';
import { SESSION_SAVED_EVENT } from './badges';

/** Practice sessions (stored in this browser, see storage/library.ts). */
export const listSessions = (since?: Date): Promise<PracticeSession[]> => list(since);

/** Saves a session and tells the badge watcher. Never throws: a lost session must not break the player. */
export function saveSession(s: NewPracticeSession): Promise<void> {
  return addSession(s)
    .then(() => {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_SAVED_EVENT));
    })
    .catch(() => undefined);
}
