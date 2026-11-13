import { describe, expect, it } from 'vitest';
import type { Assignment, PracticeSession } from '@guitar3d/shared';
import { assignmentProgress, sessionKey } from './api';

const a: Assignment = { id: 'a', tabKey: 'lesson:twinkle', title: 'Twinkle', targetSpeed: 0.9, due: '2026-11-20', createdAt: '2026-11-10T00:00:00.000Z' };
const s = (endedAt: string, extra: Partial<PracticeSession> = {}): PracticeSession => ({
  id: endedAt, kind: 'lesson', refId: 'twinkle', title: 't', startedAt: endedAt, endedAt, seconds: 300, ...extra,
});

describe('assignment progress', () => {
  it('maps sessions to tab keys', () => {
    expect(sessionKey({ kind: 'lesson', refId: 'x' })).toBe('lesson:x');
    expect(sessionKey({ kind: 'tab', refId: 'x' })).toBe('x');
  });
  it('counts only sessions after the assignment and judges the status', () => {
    const sessions = [s('2026-11-01T10:00:00.000Z', { bestCleanSpeed: 1 }), s('2026-11-12T10:00:00.000Z', { bestCleanSpeed: 0.7 }), s('2026-11-12T11:00:00.000Z', { kind: 'tab' })];
    expect(assignmentProgress(a, sessions, new Date(2026, 10, 13))).toEqual({ best: 0.7, minutes: 5, status: 'open' });
    expect(assignmentProgress(a, sessions, new Date(2026, 10, 25)).status).toBe('late');
    expect(assignmentProgress(a, [...sessions, s('2026-11-14T10:00:00.000Z', { bestCleanSpeed: 0.9 })], new Date(2026, 10, 25)).status).toBe('done');
  });
});
