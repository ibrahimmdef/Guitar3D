import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ClipboardCopy, ClipboardPaste, Download, FilePlus2, Play, Plus, Redo2, Save, Square, Trash2, Undo2, Upload } from 'lucide-react';
import type { FretNote } from '@guitar3d/shared';
import { tabsApi } from '../../tabs/api';
import {
  addBar, barFill, clearFret, deleteBar, deleteBeat, DURATION_LABEL, DURATIONS, insertBeat, newDoc, parseAlphaTex, pasteBar, setDuration, setFret, stepLeft,
  stepRight, toAlphaTex, type Cursor, type Duration, type EdBar, type EdDoc,
} from '../../music/tabEditor';
import { useTexPlayer } from '../../player/useTexPlayer';
import { Button, Toggle, useToast } from '../../ui/kit';
import { navigate, playTab } from '../../ui/router';
import { useSettings } from '../../ui/settings';
import { ScreenHeader } from '../AppShell';
import { LearnStage } from '../LearnStage';

/** Adds the chosen guitar sound to the editor's alphaTex for listening. */
const withInstrument = (tex: string, program: number) => tex.replace('\\staff {tabs}', `\\staff {tabs}\n\\instrument ${program}`);

const DRAFT_KEY = 'guitar3d.editor.draft.v1';
const STRINGS = [1, 2, 3, 4, 5, 6];

function loadDraft(): EdDoc {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw) as EdDoc;
  } catch {
    /* ignore */
  }
  return newDoc();
}

/** Undo/redo over immutable documents. */
function useHistory(initial: () => EdDoc) {
  const [state, setState] = useState(() => ({ past: [] as EdDoc[], doc: initial(), future: [] as EdDoc[] }));
  const apply = useCallback((next: EdDoc | ((d: EdDoc) => EdDoc)) => {
    setState((s) => {
      const d = typeof next === 'function' ? next(s.doc) : next;
      return d === s.doc ? s : { past: [...s.past, s.doc].slice(-100), doc: d, future: [] };
    });
  }, []);
  const undo = useCallback(() => setState((s) => (s.past.length ? { past: s.past.slice(0, -1), doc: s.past[s.past.length - 1], future: [s.doc, ...s.future] } : s)), []);
  const redo = useCallback(() => setState((s) => (s.future.length ? { past: [...s.past, s.doc], doc: s.future[0], future: s.future.slice(1) } : s)), []);
  return { doc: state.doc, apply, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

export function EditorScreen() {
  const [settings] = useSettings();
  const toast = useToast();
  const h = useHistory(loadDraft);
  const doc = h.doc;
  const [cursor, setCursor] = useState<Cursor>({ bar: 0, beat: 0, string: 1 });
  const [clip, setClip] = useState<EdBar | null>(null);
  const [advanceOnClick, setAdvanceOnClick] = useState(true);
  const [importText, setImportText] = useState('');
  const [saving, setSaving] = useState(false);
  const typed = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const gridRef = useRef<HTMLDivElement>(null);
  const player = useTexPlayer();

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(doc));
    } catch {
      /* ignore */
    }
  }, [doc]);

  // keep the cursor inside the document after deletes / undo
  const c: Cursor = useMemo(() => {
    const bar = Math.min(cursor.bar, doc.bars.length - 1);
    const beat = Math.min(cursor.beat, doc.bars[bar].beats.length - 1);
    return { bar, beat, string: cursor.string };
  }, [cursor, doc]);
  const curBeat = doc.bars[c.bar].beats[c.beat];
  const tex = useMemo(() => toAlphaTex(doc), [doc]);

  const marks: FretNote[] = useMemo(() => curBeat.notes.map((n) => ({ ...n, state: 'now' as const })), [curBeat]);
  const beatKey = c.bar * 1000 + c.beat;

  const right = (grow: boolean) => {
    const r = stepRight(doc, c, grow);
    if (r.doc !== doc) h.apply(r.doc);
    setCursor(r.cursor);
  };

  const onFretClick = (string: number, fret: number) => {
    const at = { ...c, string };
    const next = setFret(doc, at, fret);
    if (advanceOnClick) {
      const r = stepRight(next, at, true);
      h.apply(r.doc);
      setCursor(r.cursor);
    } else {
      h.apply(next);
      setCursor(at);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) h.redo();
      else h.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      h.redo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'c') {
      setClip(structuredClone(doc.bars[c.bar]));
      toast({ title: `${c.bar + 1}. ölçü kopyalandı`, durationMs: 1500 });
      return;
    }
    if (mod && e.key.toLowerCase() === 'v' && clip) {
      e.preventDefault();
      h.apply(pasteBar(doc, c.bar, clip));
      return;
    }
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      const now = performance.now();
      const prev = now - typed.current.at < 700 ? typed.current.text : '';
      const text = (prev + e.key).slice(-2);
      const fret = Number(text) <= 24 ? Number(text) : Number(e.key);
      typed.current = { text: String(fret), at: now };
      h.apply(setFret(doc, c, fret));
      return;
    }
    typed.current = { text: '', at: 0 };
    switch (e.key) {
      case 'ArrowUp':
        setCursor({ ...c, string: Math.max(1, c.string - 1) });
        break;
      case 'ArrowDown':
        setCursor({ ...c, string: Math.min(6, c.string + 1) });
        break;
      case 'ArrowLeft':
        setCursor(stepLeft(doc, c));
        break;
      case 'ArrowRight':
      case 'Tab':
        right(true);
        break;
      case 'Backspace':
      case 'Delete':
        h.apply(curBeat.notes.some((n) => n.string === c.string) ? clearFret(doc, c) : deleteBeat(doc, c));
        break;
      case 'Insert':
      case '+':
        h.apply(insertBeat(doc, c));
        setCursor({ ...c, beat: c.beat + 1 });
        break;
      case 'x':
      case 'X':
        h.apply(clearFret(doc, c));
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const doImport = (text: string) => {
    try {
      const d = parseAlphaTex(text);
      h.apply(d);
      setCursor({ bar: 0, beat: 0, string: 1 });
      toast({ title: `${d.bars.length} ölçü içe aktarıldı`, tone: 'success' });
    } catch (err) {
      toast({ title: 'İçe aktarılamadı', description: (err as Error).message, tone: 'danger' });
    }
  };

  const download = () => {
    const blob = new Blob([tex], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(doc.title || 'riff').replace(/[^\p{L}\p{N}_-]+/gu, '-')}.atex`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const save = async () => {
    setSaving(true);
    try {
      const meta = await tabsApi.uploadAlphaTex(tex, { title: doc.title, format: 'alphatex' });
      toast({ title: 'Kütüphaneye kaydedildi', description: meta.title, tone: 'success' });
      navigate(playTab(meta.id));
    } catch (err) {
      toast({ title: 'Kaydedilemedi', description: (err as Error).message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen editor-screen">
      <ScreenHeader
        title="Tab editörü"
        description="Gitara tıklayarak ya da ızgaraya perde numarası yazarak kendi riff'ini yaz, dinle, kütüphaneye kaydet."
        actions={
          <>
            <Button icon={player.playing ? <Square size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />} onClick={() => (player.playing ? player.stop() : player.play(withInstrument(tex, settings.program)))}>
              {player.playing ? 'Durdur' : 'Dinle'}
            </Button>
            <Button variant="primary" icon={<Save size={15} />} onClick={save} disabled={saving}>Kaydet</Button>
          </>
        }
      />

      <div className="editor-top">
        <LearnStage notes={marks} beatId={beatKey} cameraMode="overview" label="Gitar: tıklanan perde imleçteki vuruşa yazılır" onFretClick={onFretClick}>
          <span className="hud-chip num">{c.bar + 1}. ölçü · {c.beat + 1}. vuruş</span>
        </LearnStage>
        <div className="learn-side">
          <label className="field">
            <span>Başlık</span>
            <input className="input" value={doc.title} onChange={(e) => h.apply({ ...doc, title: e.target.value })} />
          </label>
          <div className="p2-row">
            <label className="field">
              <span>Tempo</span>
              <input className="input input-num" type="number" min={30} max={260} value={doc.tempo} onChange={(e) => h.apply({ ...doc, tempo: Math.max(30, Math.min(260, Number(e.target.value) || 90)) })} />
            </label>
            <label className="field">
              <span>Ölçü</span>
              <select className="select" value={doc.beatsPerBar} onChange={(e) => h.apply({ ...doc, beatsPerBar: Number(e.target.value) })}>
                {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}/4</option>)}
              </select>
            </label>
          </div>
          <div className="chip-group" role="group" aria-label="Vuruş süresi">
            <span className="chip-group-label">Süre</span>
            <div className="chip-row">
              {DURATIONS.map((d) => (
                <button key={d} type="button" className={`chip${curBeat.duration === d ? ' is-on' : ''}`} aria-pressed={curBeat.duration === d} onClick={() => h.apply(setDuration(doc, c, d as Duration))}>
                  {DURATION_LABEL[d]}
                </button>
              ))}
            </div>
          </div>
          <Toggle checked={advanceOnClick} onChange={setAdvanceOnClick} label="Gitara tıklayınca ilerle" description="Kapalıysa aynı vuruşa akor gibi nota eklenir." />
          <div className="p2-row">
            <Button size="sm" variant="ghost" icon={<Undo2 size={15} />} onClick={h.undo} disabled={!h.canUndo}>Geri al</Button>
            <Button size="sm" variant="ghost" icon={<Redo2 size={15} />} onClick={h.redo} disabled={!h.canRedo}>Yinele</Button>
          </div>
        </div>
      </div>

      <div className="p2-row editor-tools">
        <Button size="sm" icon={<Plus size={15} />} onClick={() => h.apply(insertBeat(doc, c))}>Vuruş ekle</Button>
        <Button size="sm" icon={<FilePlus2 size={15} />} onClick={() => { h.apply(addBar(doc, c.bar)); setCursor({ ...c, bar: c.bar + 1, beat: 0 }); }}>Ölçü ekle</Button>
        <Button size="sm" icon={<ClipboardCopy size={15} />} onClick={() => setClip(structuredClone(doc.bars[c.bar]))}>Ölçüyü kopyala</Button>
        <Button size="sm" icon={<ClipboardPaste size={15} />} disabled={!clip} onClick={() => clip && h.apply(addBar(doc, c.bar, clip))}>Sonrasına yapıştır</Button>
        <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} onClick={() => h.apply(deleteBar(doc, c.bar))}>Ölçüyü sil</Button>
      </div>

      <div className="editor-grid" ref={gridRef} tabIndex={0} onKeyDown={onKey} role="grid" aria-label="Tab ızgarası. Rakamlarla perde yaz, oklarla gez, Sil ile temizle, Ctrl+Z geri al, Ctrl+C / Ctrl+V ölçü kopyala.">
        {doc.bars.map((bar, bi) => {
          const fill = barFill(doc, bar);
          return (
            <div key={bi} className={`ed-bar is-${fill}`} role="rowgroup" aria-label={`${bi + 1}. ölçü`}>
              <div className="ed-bar-head">
                <span className="num">{bi + 1}</span>
                {fill !== 'full' && <span className="ed-fill">{fill === 'short' ? 'eksik' : 'taşıyor'}</span>}
              </div>
              {STRINGS.map((s) => (
                <div key={s} className="ed-line" role="row">
                  {bar.beats.map((b, k) => {
                    const n = b.notes.find((x) => x.string === s);
                    const on = c.bar === bi && c.beat === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        role="gridcell"
                        tabIndex={-1}
                        className={`ed-cell num${on ? ' is-col' : ''}${on && c.string === s ? ' is-cursor' : ''}${b.notes.length === 0 ? ' is-rest' : ''}`}
                        style={{ flexGrow: 16 / b.duration }}
                        aria-label={`${bi + 1}. ölçü ${k + 1}. vuruş ${s}. tel: ${n ? `${n.fret}. perde` : 'boş'}`}
                        onClick={() => {
                          setCursor({ bar: bi, beat: k, string: s });
                          gridRef.current?.focus();
                        }}
                      >
                        {n ? n.fret : ''}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="subtle small">Klavye: rakam = perde (iki hane hızlı yaz), ←/→ vuruş, ↑/↓ tel, Sil = notayı ya da boş vuruşu sil, + = vuruş ekle, Ctrl+Z geri al.</p>

      <section className="editor-io" aria-label="İçe ve dışa aktar">
        <h2 className="section-title">alphaTex</h2>
        <div className="p2-row">
          <Button size="sm" icon={<Download size={15} />} onClick={download}>.atex indir</Button>
          <Button size="sm" icon={<ClipboardCopy size={15} />} onClick={() => navigator.clipboard?.writeText(tex).then(() => toast({ title: 'Panoya kopyalandı', durationMs: 1500 }))}>Kopyala</Button>
          <label className="btn btn-secondary btn-sm">
            <span className="btn-ic" aria-hidden><Upload size={15} /></span>
            <span className="btn-label">Dosyadan yükle</span>
            <input type="file" accept=".atex,.txt,.alphatex" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(doImport); e.target.value = ''; }} />
          </label>
          <Button size="sm" variant="ghost" onClick={() => { h.apply(newDoc()); setCursor({ bar: 0, beat: 0, string: 1 }); }}>Yeni</Button>
        </div>
        <textarea className="input editor-tex" rows={6} value={importText || tex} onChange={(e) => setImportText(e.target.value)} aria-label="alphaTex metni" spellCheck={false} />
        {importText && importText !== tex && (
          <div className="p2-row">
            <Button size="sm" variant="primary" onClick={() => { doImport(importText); setImportText(''); }}>Metinden içe aktar</Button>
            <Button size="sm" variant="ghost" onClick={() => setImportText('')}>Vazgeç</Button>
          </div>
        )}
        <p className="subtle small">Kaydedince parça kütüphaneye eklenir ve oynatıcıda açılır.</p>
      </section>
    </div>
  );
}
