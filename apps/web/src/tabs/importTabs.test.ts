import { beforeEach, describe, it, expect, vi } from 'vitest';
import { exporter, importer, LogLevel, Settings } from '@coderline/alphatab';
import { importTabs, sniffText } from './importTabs';
import { tabsApi } from './api';
import { useMemoryDb } from '../storage/db';
import { listTabs, tabFile } from '../storage/library';

const RIFF = `Title: Hourglass
e|-----------------|
B|-----------------|
G|-------2---2-----|
D|---2-------------|
A|-0---0---0---0---|
E|-----------------|
`;

const TEX = '\\title "Tex Etude"\n\\artist "Someone"\n\\track "Guitar"\n\\staff {tabs}\n:4 0.6 2.6 3.6 5.6 |';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>XML Etude</work-title></work>
  <identification><creator type="composer">Test</creator></identification>
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

function gp7Bytes() {
  const s = new Settings();
  s.core.logLevel = LogLevel.None;
  const score = importer.ScoreLoader.loadAlphaTex('\\title "GP Riff"\n\\artist "Exporter"\n\\track "Guitar"\n:4 0.6 3.6 5.6 3.6 |', s);
  return new exporter.Gp7Exporter().export(score, s);
}

describe('sniffText', () => {
  it('tells ASCII tab, alphaTex and prose apart', () => {
    expect(sniffText(RIFF)).toBe('ascii');
    expect(sniffText(TEX)).toBe('alphatex');
    expect(sniffText('Hello, these are not song lyrics.')).toBe('unknown');
  });
});

describe('importTabs', () => {
  beforeEach(() => void useMemoryDb());

  it('converts pasted ASCII tab and uploads it as alphaTex', async () => {
    const [r] = await importTabs(RIFF, { ascii: { tempo: 110 } });
    expect(r.ok).toBe(true);
    expect(r.format).toBe('ascii');
    expect(r.title).toBe('Hourglass');
    expect(r.alphaTex).toContain('\\tempo 110');
    const stored = await listTabs();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ format: 'ascii', title: 'Hourglass', id: r.meta?.id });
    expect(new TextDecoder().decode(await tabFile(stored[0].id))).toContain('\\tempo 110');
  });

  it('imports several files in one go and reports bad ones', async () => {
    const files = [
      new File([RIFF.replace('Title: Hourglass\n', '')], 'my-riff.txt'),
      new File([TEX], 'etut.atex'),
      new File([XML], 'etut.musicxml'),
      new File([new Uint8Array(gp7Bytes()) as Uint8Array<ArrayBuffer>], 'riff.gp'),
      new File(['not a guitar pro file'], 'broken.gp5'),
      new File(['hello'], 'notes.pdf'),
      new File(['just words'], 'words.txt'),
    ];
    const res = await importTabs(files);
    expect(res.map((r) => [r.name, r.ok])).toEqual([
      ['my-riff.txt', true],
      ['etut.atex', true],
      ['etut.musicxml', true],
      ['riff.gp', true],
      ['broken.gp5', false],
      ['notes.pdf', false],
      ['words.txt', false],
    ]);
    expect(res[0].title).toBe('my-riff');
    expect(res[1]).toMatchObject({ format: 'alphatex', title: 'Tex Etude', artist: 'Someone' });
    expect(res[2]).toMatchObject({ format: 'musicxml', title: 'XML Etude' });
    expect(res[3]).toMatchObject({ format: 'gp', title: 'GP Riff', artist: 'Exporter' });
    expect(res[4].error).toMatch(/Couldn't read/);
    expect(res[5].error).toMatch(/Unsupported/);
    const stored = await listTabs({ sort: 'title' });
    expect(stored.map((t) => [t.title, t.format])).toEqual([['GP Riff', 'gp'], ['my-riff', 'ascii'], ['Tex Etude', 'alphatex'], ['XML Etude', 'musicxml']]);
  });

  it('can parse without uploading and reports alphaTex errors', async () => {
    const [ok] = await importTabs(TEX, { upload: false });
    expect(ok.ok).toBe(true);
    expect(ok.meta).toBeUndefined();
    const [bad] = await importTabs([new File(['\\track "x"\n:4 0.9 |'], 'bad.atex')], { upload: false });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/alphaTex/);
  });

  it('reports storage errors per file', async () => {
    vi.spyOn(tabsApi, 'uploadAlphaTex').mockRejectedValueOnce(new Error('Disk full'));
    const [r] = await importTabs([new File([TEX], 'a.tex')]);
    expect(r).toMatchObject({ ok: false, error: 'Disk full' });
  });
});
