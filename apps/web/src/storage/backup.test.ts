import { beforeEach, describe, expect, it } from 'vitest';
import type { TabMeta } from '@guitar3d/shared';
import { applyLocal, collectLocal, fromOldBackup, makeBackup, parseBackup, restoreBackup, type OldBackup } from './backup';
import { db, useMemoryDb } from './db';
import { addNote, addTabText, getProgress, listNotes, listTabs, recordPass, tabFile } from './library';
import { getSettings } from './guitars';

function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    m,
  };
}

const b64 = (s: string) => btoa(s);

describe('backup file', () => {
  beforeEach(() => void useMemoryDb());

  it('collects and applies only guitar3d localStorage keys', () => {
    expect(collectLocal(memory({ 'guitar3d.settings.v1': '{}', other: 'x' }))).toEqual({ 'guitar3d.settings.v1': '{}' });
    const s = memory();
    expect(applyLocal({ 'guitar3d.a': '1', evil: '2', 'guitar3d.b': 3 }, s)).toBe(1);
    expect([...s.m.keys()]).toEqual(['guitar3d.a']);
  });

  it('validates the file', () => {
    expect(() => parseBackup('nope')).toThrow(/JSON/);
    expect(() => parseBackup('{"format":"x"}')).toThrow(/Guitar3D/);
    expect(() => parseBackup('{"format":"guitar3d-backup","version":9}')).toThrow(/newer/);
  });

  it('round-trips everything, binary files included, through JSON', async () => {
    const tab = await addTabText('\\title "Riff"\n.\n0.6.4 |');
    await recordPass(tab.id, { startBar: 0, endBar: 1, speed: 0.8, clean: true, mode: 'manual' });
    await addNote({ tabKey: tab.id, bar: 0, text: 'mute here' });
    const file = JSON.parse(JSON.stringify(await makeBackup({ 'guitar3d.x': '1' })));

    useMemoryDb();
    let local: unknown;
    await restoreBackup(parseBackup(JSON.stringify(file)), (l) => (local = l));
    expect((await listTabs()).map((t) => t.title)).toEqual(['Riff']);
    expect(new TextDecoder().decode(await tabFile(tab.id))).toContain('0.6.4');
    expect((await getProgress(tab.id)).sections[0].bestCleanSpeed).toBe(0.8);
    expect((await listNotes(tab.id)).map((n) => n.text)).toEqual(['mute here']);
    expect(local).toEqual({ 'guitar3d.x': '1' });
  });

  it('reads backups of the old server version: tab files, guitar photos and their URLs', async () => {
    const old: OldBackup = {
      format: 'guitar3d-backup',
      server: {
        version: 1,
        db: {
          tabs: [{ id: 't1', title: 'Song', artist: '', fileName: 't1.gp3', uploadedAt: '2026-01-01', transcription: { jobId: 'j' } } as TabMeta],
          progress: { t1: { tabId: 't1', sections: [] } },
          guitars: { g1: { id: 'g1', name: 'Mine', textures: { bodyTop: '/api/guitars/g1/textures/bodyTop?v=1', fretboard: { url: '/guitar/fb.jpg', toFret: 12 } } } },
          settings: { activeGuitarId: 'g1' },
          sessions: [],
          notes: [],
        },
        files: { 'tabs/t1.gp3': b64('GP3'), 'guitars/g1/bodyTop.jpg': b64('JPG'), 'tabs/missing.gp5': b64('x') },
      },
      local: { 'guitar3d.settings.v1': '{}' },
    };
    await restoreBackup(old, () => {});
    const [t] = await listTabs();
    expect(t).not.toHaveProperty('transcription');
    expect(new TextDecoder().decode(await tabFile('t1'))).toBe('GP3');
    const g = await db().get<{ textures: { bodyTop: string; fretboard: { url: string } } }>('guitars', 'g1');
    expect(g?.textures.bodyTop).toBe('local:g1/bodyTop?v=1');
    expect(g?.textures.fretboard.url).toBe('/guitar/fb.jpg');
    expect(await db().get('textures', 'g1/bodyTop')).toMatchObject({ type: 'image/jpeg' });
    expect((await getSettings()).activeGuitarId).toBe('g1');
    expect(fromOldBackup(old).local).toEqual({ 'guitar3d.settings.v1': '{}' });
  });
});
