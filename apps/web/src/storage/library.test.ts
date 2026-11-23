import { beforeEach, describe, expect, it } from 'vitest';
import { useMemoryDb } from './db';
import { addNote, addSession, addTabFile, addTabText, deleteTab, getProgress, listNotes, listSessions, listTabs, markTabPlayed, putProgress, recordPass, renameTab, tabFile } from './library';

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe('tab library', () => {
  beforeEach(() => void useMemoryDb());

  it('reads titles from text files, keeps binary files as they are and rejects other files', async () => {
    const tex = await addTabFile(bytes('\\title "Etüt"\n\\artist "Ali"\n.\n0.6.4 |'), 'etut.tex');
    expect(tex).toMatchObject({ title: 'Etüt', artist: 'Ali', format: 'alphatex' });
    expect(tex.fileName.endsWith('.atex')).toBe(true);
    const gp = await addTabFile(bytes('GP'), 'Song Name.gp5', { title: 'From alphaTab' });
    expect(gp).toMatchObject({ title: 'From alphaTab', format: 'gp5' });
    expect(new TextDecoder().decode(await tabFile(gp.id))).toBe('GP');
    await expect(addTabFile(bytes('x'), 'notes.pdf')).rejects.toThrow(/supported/);
  });

  it('searches without accents and sorts by title, upload or last played', async () => {
    const a = await addTabText('.\n0.6.4 |', { title: 'Büklüm' });
    await new Promise((r) => setTimeout(r, 2));
    const b = await addTabText('.\n0.6.4 |', { title: 'Another' });
    expect((await listTabs({ q: 'buklum' })).map((t) => t.id)).toEqual([a.id]);
    expect((await listTabs({ sort: 'title' })).map((t) => t.title)).toEqual(['Another', 'Büklüm']);
    expect((await listTabs()).map((t) => t.id)).toEqual([b.id, a.id]);
    await markTabPlayed(a.id);
    expect((await listTabs({ sort: 'played' }))[0].id).toBe(a.id);
    await expect(renameTab(a.id, { title: '  ' })).rejects.toThrow(/empty/);
    expect((await renameTab(a.id, { title: 'Yeni' })).title).toBe('Yeni');
  });

  it('deleting a tab removes its file and progress', async () => {
    const t = await addTabText('.\n0.6.4 |');
    await recordPass(t.id, { startBar: 0, endBar: 0, speed: 1, clean: true, mode: 'manual' });
    await deleteTab(t.id);
    expect(await listTabs()).toEqual([]);
    await expect(tabFile(t.id)).rejects.toThrow(/no longer/);
    expect((await getProgress(t.id)).sections).toEqual([]);
  });
});

describe('progress', () => {
  beforeEach(() => void useMemoryDb());

  it('keeps every pass and raises the best speed only on clean passes', async () => {
    await recordPass('t', { startBar: 2, endBar: 5, speed: 0.7, clean: true, mode: 'manual', bpm: 90 });
    await recordPass('t', { startBar: 2, endBar: 5, speed: 0.9, clean: false, mode: 'mic', score: 61.4 });
    const [s] = (await getProgress('t')).sections;
    expect(s).toMatchObject({ bestCleanSpeed: 0.7, bpm: 90 });
    expect(s.history!.map((h) => [h.speed, h.clean, h.score])).toEqual([[0.7, true, undefined], [0.9, false, 61]]);
    await expect(recordPass('t', { startBar: 5, endBar: 2, speed: 1, clean: true, mode: 'manual' })).rejects.toThrow(/startBar/);
  });

  it('saving best speeds only does not wipe the pass history', async () => {
    await recordPass('t', { startBar: 0, endBar: 3, speed: 0.6, clean: true, mode: 'manual' });
    await putProgress({ tabId: 't', sections: [{ startBar: 0, endBar: 3, bestCleanSpeed: 0.8, updatedAt: 'now' }] });
    const [s] = (await getProgress('t')).sections;
    expect(s.bestCleanSpeed).toBe(0.8);
    expect(s.history).toHaveLength(1);
  });
});

describe('notes and sessions', () => {
  beforeEach(() => void useMemoryDb());

  it('lists a tab\'s notes by bar', async () => {
    await addNote({ tabKey: 't', bar: 4, text: 'later' });
    await addNote({ tabKey: 't', bar: 1, text: 'first' });
    await addNote({ tabKey: 'other', bar: 0, text: 'x' });
    expect((await listNotes('t')).map((n) => n.text)).toEqual(['first', 'later']);
    await expect(addNote({ tabKey: 't', bar: 0, text: ' ' })).rejects.toThrow();
  });

  it('stores sessions, newest first, and filters by end time', async () => {
    await addSession({ kind: 'tab', title: 'Old', startedAt: '2026-01-01T10:00:00Z', endedAt: '2026-01-01T10:10:00Z', seconds: 600 });
    await addSession({ kind: 'tab', title: '', startedAt: '2026-03-01T10:00:00Z', endedAt: '', seconds: 60 });
    expect(await addSession({ kind: 'tab', title: 'x', startedAt: 'nope', endedAt: '', seconds: 5 })).toBeNull();
    const all = await listSessions();
    expect(all.map((s) => s.title)).toEqual(['Practice', 'Old']);
    expect(all[0].endedAt).toBe('2026-03-01T10:01:00.000Z');
    expect((await listSessions(new Date('2026-02-01'))).map((s) => s.title)).toEqual(['Practice']);
  });
});
