import { describe, it, expect } from 'vitest';
import { exporter, importer, LogLevel, Settings } from '@coderline/alphatab';
import { importTabs, sniffText } from './importTabs';

const RIFF = `Title: Kum Saati
e|-----------------|
B|-----------------|
G|-------2---2-----|
D|---2-------------|
A|-0---0---0---0---|
E|-----------------|
`;

const TEX = '\\title "Tex Etüdü"\n\\artist "Biri"\n\\track "Gitar"\n\\staff {tabs}\n:4 0.6 2.6 3.6 5.6 |';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>XML Etüdü</work-title></work>
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
  const score = importer.ScoreLoader.loadAlphaTex('\\title "GP Riff"\n\\artist "Exporter"\n\\track "Gitar"\n:4 0.6 3.6 5.6 3.6 |', s);
  return new exporter.Gp7Exporter().export(score, s);
}

/** Records requests and answers like the server would. */
function fakeServer() {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    let body: Record<string, unknown> = {};
    if (init?.body instanceof FormData) body = { title: init.body.get('title'), artist: init.body.get('artist'), kind: 'multipart' };
    else if (typeof init?.body === 'string') body = { ...JSON.parse(init.body), kind: 'json' };
    return new Response(JSON.stringify({ id: String(calls.length), fileName: 'x', uploadedAt: 'now', ...body }), { status: 201 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('sniffText', () => {
  it('tells ASCII tab, alphaTex and prose apart', () => {
    expect(sniffText(RIFF)).toBe('ascii');
    expect(sniffText(TEX)).toBe('alphatex');
    expect(sniffText('Merhaba, bu bir şarkı sözü değil.')).toBe('unknown');
  });
});

describe('importTabs', () => {
  it('converts pasted ASCII tab and uploads it as alphaTex', async () => {
    const { f, calls } = fakeServer();
    const [r] = await importTabs(RIFF, { fetchImpl: f, ascii: { tempo: 110 } });
    expect(r.ok).toBe(true);
    expect(r.format).toBe('ascii');
    expect(r.title).toBe('Kum Saati');
    expect(r.alphaTex).toContain('\\tempo 110');
    expect(calls).toHaveLength(1);
    const sent = JSON.parse(calls[0].init!.body as string);
    expect(sent).toMatchObject({ format: 'ascii', title: 'Kum Saati' });
    expect(r.meta?.id).toBe('1');
  });

  it('imports several files in one go and reports bad ones', async () => {
    const { f, calls } = fakeServer();
    const files = [
      new File([RIFF.replace('Title: Kum Saati\n', '')], 'my-riff.txt'),
      new File([TEX], 'etut.atex'),
      new File([XML], 'etut.musicxml'),
      new File([new Uint8Array(gp7Bytes()) as Uint8Array<ArrayBuffer>], 'riff.gp'),
      new File(['not a guitar pro file'], 'broken.gp5'),
      new File(['hello'], 'notes.pdf'),
      new File(['just words'], 'words.txt'),
    ];
    const res = await importTabs(files, { fetchImpl: f });
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
    expect(res[1]).toMatchObject({ format: 'alphatex', title: 'Tex Etüdü', artist: 'Biri' });
    expect(res[2]).toMatchObject({ format: 'musicxml', title: 'XML Etüdü' });
    expect(res[3]).toMatchObject({ format: 'gp', title: 'GP Riff', artist: 'Exporter' });
    expect(res[4].error).toMatch(/okunamadı/);
    expect(res[5].error).toMatch(/Desteklenmeyen/);
    expect(calls).toHaveLength(4);
    expect(calls[3].init!.body).toBeInstanceOf(FormData);
    expect((calls[3].init!.body as FormData).get('title')).toBe('GP Riff');
  });

  it('can parse without uploading and reports alphaTex errors', async () => {
    const [ok] = await importTabs(TEX, { upload: false });
    expect(ok.ok).toBe(true);
    expect(ok.meta).toBeUndefined();
    const [bad] = await importTabs([new File(['\\track "x"\n:4 0.9 |'], 'bad.atex')], { upload: false });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/alphaTex/);
  });

  it('surfaces server errors per file', async () => {
    const f = (async () => new Response(JSON.stringify({ error: 'Disk dolu' }), { status: 500 })) as unknown as typeof fetch;
    const [r] = await importTabs([new File([TEX], 'a.tex')], { fetchImpl: f });
    expect(r).toMatchObject({ ok: false, error: 'Disk dolu' });
  });
});
