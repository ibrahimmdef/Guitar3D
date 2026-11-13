import { useMemo, useState, type ReactNode } from 'react';
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
export function TextImportDialog({ open, onOpenChange, onSaved, initialText = '', header, title = 'Metinden tab', description }: Props) {
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
      const meta = await tabsApi.uploadAlphaTex(texWithTitle, { title: name.trim() || result.title || 'İçe aktarılan tab', artist: result.artist, format: 'ascii' });
      onSaved(meta);
      setText('');
      setName('');
      onOpenChange(false);
    } catch (e) {
      toast({ tone: 'danger', title: 'Kaydedilemedi.', description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const openInPlayer = () => {
    if (!ok) return;
    setPreviewLesson(texWithTitle, name.trim() || result.title || 'Önizleme');
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
      description={description ?? 'ASCII tabı yapıştır. Sağda dönüşümü görürsün; kaydetmeden önce metni düzeltebilirsin.'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" icon={player.playing ? <Square size={15} /> : <Play size={15} />} disabled={!ok} onClick={() => (player.playing ? player.stop() : player.play(texWithTitle))}>
            {player.playing ? 'Durdur' : 'Dinle'}
          </Button>
          <Button variant="secondary" icon={<SquareArrowOutUpRight size={15} />} disabled={!ok} onClick={openInPlayer}>Oynatıcıda aç</Button>
          <Button variant="primary" icon={<Save size={15} />} disabled={!ok || saving} onClick={save}>{saving ? 'Kaydediliyor…' : 'Kütüphaneye kaydet'}</Button>
        </>
      }
    >
      {header}
      <div className="ti-grid">
        <label className="sr-only" htmlFor="ti-text">Tab metni</label>
        <textarea id="ti-text" className="input" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder={PLACEHOLDER} />
        <div className="ti-side">
          <label className="field">
            Ad
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={typeof result !== 'string' ? result.title ?? 'Adsız tab' : 'Adsız tab'} />
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
                {result.systems} sistem · {result.bars} ölçü · {result.notes} nota
              </p>
              {result.warnings.length > 0 && (
                <ul className="ti-warn">
                  {result.warnings.slice(0, 5).map((w) => <li key={w}>{w}</li>)}
                </ul>
              )}
              <details>
                <summary className="subtle small">alphaTex çıktısı</summary>
                <pre className="ti-code">{result.alphaTex}</pre>
              </details>
            </>
          )}
          <p className="subtle small">Ritim karakter aralıklarından tahmin edilir. Her ölçü çizgisi | bir ölçü sayılır. h, p, /, \, b, x, ~ işaretleri desteklenir.</p>
        </div>
      </div>
    </Dialog>
  );
}

/** Image → OCR → the same editable text dialog. */
export function ImageImportDialog(p: Omit<Props, 'initialText' | 'header' | 'title' | 'description'>) {
  const [text, setText] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (file: File) => {
    setError(null);
    setProgress(0);
    try {
      const { ocrImage } = await import('../../tabs/ocr');
      const out = await ocrImage(file, setProgress);
      setText(out || ' ');
      if (!out.trim()) setError('Görselde metin bulunamadı.');
    } catch (e) {
      setError(`Metin okunamadı: ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };
  const header = (
    <div className="ti-image">
      <div className="ti-row">
        <label className="btn btn-secondary btn-md">
          <span className="btn-label">{progress != null ? `Okunuyor… %${Math.round(progress * 100)}` : 'Görsel seç'}</span>
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={progress != null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void run(f);
            }}
          />
        </label>
        <span className="subtle small">En iyi sonuç: düz yazı (ASCII) tabların net ekran görüntüsü. Nota yazılı ya da el yazısı tablar okunmaz.</span>
      </div>
      {error && <p className="ti-err" role="alert">{error}</p>}
    </div>
  );
  return (
    <TextImportDialog
      {...p}
      initialText={text}
      header={header}
      title="Görselden tab"
      description="Tab ekran görüntüsü ya da fotoğrafı seç. Metin tarayıcında okunur; hataları kaydetmeden önce düzelt."
    />
  );
}
