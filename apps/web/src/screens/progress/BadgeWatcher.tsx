import { useEffect, useRef } from 'react';
import { loadDone } from '../../music/course';
import { useToast } from '../../ui/kit';
import { useSettings } from '../../ui/settings';
import { earnedBadges, markSeen, SESSION_SAVED_EVENT } from './badges';
import { listSessions } from './sessions';

/** Re-checks badges at start and after every saved session; toasts the new ones. */
export function BadgeWatcher() {
  const toast = useToast();
  const [settings] = useSettings();
  const goal = useRef(settings.weeklyGoalMinutes);
  goal.current = settings.weeklyGoalMinutes;
  useEffect(() => {
    let alive = true;
    const check = () => {
      listSessions()
        .then((sessions) => {
          if (!alive) return;
          const fresh = markSeen(earnedBadges({ sessions, courseDone: loadDone(), weeklyGoalMinutes: goal.current }));
          for (const b of fresh) toast({ tone: 'success', title: `Yeni rozet: ${b.title}`, description: b.description, durationMs: 6000 });
        })
        .catch(() => {});
    };
    check();
    window.addEventListener(SESSION_SAVED_EVENT, check);
    return () => {
      alive = false;
      window.removeEventListener(SESSION_SAVED_EVENT, check);
    };
  }, [toast]);
  return null;
}
