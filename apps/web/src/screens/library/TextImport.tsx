import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Play, Save, Square, SquareArrowOutUpRight } from 'lucide-react';
import type { TabMeta } from '@guitar3d/shared';
import { convertAscii, withTitle } from '../../tabs/textImport';
import { tabsApi } from '../../tabs/api';
import { useTexPlayer } from '../../player/useTexPlayer';
import { Button, Dialog, useToast } from '../../ui/kit';
import { navigate, playLesson } from '../../ui/router';
import { PREVIEW_LESSON_ID, setPreviewLesson } from './lessons';

const PLACEHOLDER = `e|-----0-----|-0h2-----|
B|---1---1---|-----3p1-|
G|-2-------2-|---------|
D|-----------|---------|
A|-----------|---------|
E|-----------|---------|`;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (t: TabMeta) => void;
  /** Initial text (e.g. OCR output). */
  initialText?: string;
  /** Extra content above the textarea (image picker). */
  header?: ReactNode;
  title?: string;
  description?: string;
}

/**
 * Paste ASCII tab → editable textarea, live conversion summary, listen / open in player / save.
 * The text stays editable so OCR mistakes or odd spacing can be fixed before saving.
 */
export function TextImportDialog({ open, onOpenChange, onSaved, initialText = '', header, title = 'Tab from text', description }: Props) {
  const toast = useToast();
  const [text, setText] = useState(initialText);
  const [seen, setSeen] = useState(initialText);
  if (initialText !== seen) {
    setSeen(initialText);
    setText(initialText);
  }
  const [name, setName] = useState('');
  const [tempo, setTempo] = useState('');
  const [saving, setSaving] = useState(false);
  const player = useTexPlayer();

  const bpm = Number(tempo) >= 30 && Number(tempo) <= 300 ? Number(tempo) : undefined;
  const result = useMemo(() => convertAscii(text, bpm), [text, bpm]);
  const ok = typeof result !== 'string' && result.notes > 0;
  const texWithTitle = ok ? withTitle(result.alphaTex, name.trim() || result.title || '') : '';

  const save = async () => {
    if (!ok) return;
    setSaving(true);
    try {
      const meta = await tabsApi.uploadAlphaTex(texWithTitle, { title: name.trim() || result.title || 'Imported tab', artist: result.artist, format: 'ascii' });
      onSaved(meta);
      setText('');
      setName('');
      onOpenChange(false);
    } catch (e) {
      toast({ tone: 'danger', title: 'Couldn\'t save.', description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const openInPlayer = () => {
    if (!ok) return;
    setPreviewLesson(texWithTitle, name.trim() || result.title || 'Preview');
    navigate(playLesson(PREVIEW_LESSON_ID));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) player.stop();
        onOpenChange(o);
      }}
      title={title}
      description={description ?? 'Paste an ASCII tab. The conversion shows on the right; you can fix the text before saving.'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" icon={player.playing ? <Square size={15} /> : <Play size={15} />} disabled={!ok} onClick={() => (player.playing ? player.stop() : player.play(texWithTitle))}>
            {player.playing ? 'Stop' : 'Listen'}
          </Button>
          <Button variant="secondary" icon={<SquareArrowOutUpRight size={15} />} disabled={!ok} onClick={openInPlayer}>Open in player</Button>
          <Button variant="primary" icon={<Save size={15} />} disabled={!ok || saving} onClick={save}>{saving ? 'Saving…' : 'Save to library'}</Button>
        </>
      }
    >
      {header}
      <div className="ti-grid">
        <label className="sr-only" htmlFor="ti-text">Tab text</label>
        <textarea id="ti-text" className="input" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder={PLACEHOLDER} />
        <div className="ti-side">
          <label className="field">
            Name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={typeof result !== 'string' ? result.title ?? 'Untitled tab' : 'Untitled tab'} />
          </label>
          <label className="field">
            Tempo (BPM)
            <input className="input input-num" type="number" min={30} max={300} value={tempo} onChange={(e) => setTempo(e.target.value)} placeholder={typeof result !== 'string' ? String(result.tempo) : '90'} />
          </label>
          {typeof result === 'string' ? (
            result && <p className="ti-err" role="alert">{result}</p>
          ) : (
            <>
              <p className="ti-summary num" aria-live="polite">
                {result.systems} systems · {result.bars} bars · {result.notes} notes
              </p>
              {result.warnings.length > 0 && (
                <ul className="ti-warn">
                  {[...new Set(result.warnings)].slice(0, 5).map((w) => <li key={w}>{w}</li>)}
                </ul>
              )}
              <details>
                <summary className="subtle small">alphaTex output</summary>
                <pre className="ti-code">{result.alphaTex}</pre>
              </details>
            </>
          )}
          <p className="subtle small">Rhythm is guessed from character spacing. Each bar line | counts as one bar. The symbols h, p, /, \, b, x, ~ are supported.</p>
        </div>
      </div>
    </Dialog>
  );
}

/** Image → OCR → the same editable text dialog. */
export function ImageImportDialog({ initialFile, ...p }: Omit<Props, 'initialText' | 'header' | 'title' | 'description'> & { initialFile?: File | null }) {
  const [text, setText] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const busy = progress != null;
  const run = async (file: Blob) => {
    setError(null);
    setNote(null);
    setProgress(0);
    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test((file as File).name ?? '');
      if (isPdf) {
        const { readPdf } = await import('../../tabs/pdf');
        const out = await readPdf(file, setProgress);
        setText(out.text || ' ');
        if (out.mode === 'text') setNote(`Tab text taken from the PDF (${out.pages} pages). Rhythm is guessed from spacing; check it.`);
        else if (out.mode === 'scan') setNote(`Pages read as images: ${out.systems} tab lines (${out.pages} pages). Compare the notes with the PDF and fix any mistakes.`);
        else setError(out.text.trim() ? 'No tab lines found in the PDF; its text is below.' : 'No tab found in the PDF.');
        return;
      }
      const { ocrImage } = await import('../../tabs/ocr');
      const out = await ocrImage(file, setProgress);
      setText(out.text || ' ');
      if (!out.text.trim()) setError('No tab found in the image.');
      else if (out.mode === 'layout') setNote(`Found ${out.systems} tab lines. Compare the notes with the image and fix misread frets in the text.`);
      else setNote('No string lines found; read as text. Check the result.');
    } catch (e) {
      setError(`Couldn't read the text: ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };
  // A file dropped on the library's upload area.
  const startedWith = useRef<File | null>(null);
  useEffect(() => {
    if (initialFile && startedWith.current !== initialFile) {
      startedWith.current = initialFile;
      void run(initialFile);
    }
  });
  // Ctrl+V a screenshot straight into the dialog.
  useEffect(() => {
    if (!p.open) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f && !busy) {
        e.preventDefault();
        void run(f);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });
  const header = (
    <div className="ti-image">
      <div className="ti-row">
        <label className="btn btn-secondary btn-md">
          <span className="btn-label">{progress != null ? `Reading… ${Math.round(progress * 100)}%` : 'Choose an image or PDF'}</span>
          <input
            type="file"
            accept="image/*,application/pdf,.pdf"
            hidden
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void run(f);
            }}
          />
        </label>
        <span className="subtle small">Choose a PDF or image, or paste a screenshot (Ctrl+V). Text (ASCII) tabs and tabs drawn by software can be read; handwriting, skewed photos and standard notation can't.</span>
      </div>
      {error && <p className="ti-err" role="alert">{error}</p>}
      {note && <p className="subtle small" role="status">{note}</p>}
    </div>
  );
  return (
    <TextImportDialog
      {...p}
      initialText={text}
      header={header}
      title="Tab from PDF or image"
      description="Choose a tab PDF, screenshot or photo. Everything is read in your browser; fix any mistakes before saving."
    />
  );
}
