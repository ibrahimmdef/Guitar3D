import { useCallback, useEffect, useRef, useState } from 'react';
import { importTabs, TAB_ACCEPT, type ImportedTab } from './importTabs';
import type { AsciiTabOptions } from './asciiTab';

export interface TabImportDropzoneProps {
  /** Called after every import batch with the per-file results (successful ones carry `meta`). */
  onImported?: (results: ImportedTab[]) => void;
  /** Listen for drops anywhere in the window (default true); shows a full-screen overlay while dragging. */
  global?: boolean;
  /** Show the ASCII paste area (default true). */
  showPaste?: boolean;
  className?: string;
}

/**
 * Drag & drop / file picker / paste area for tabs. Minimal styling through CSS variables
 * (`--tid-*`, falling back to the app tokens) so the UI workstream can restyle it.
 */
export function TabImportDropzone({ onImported, global = true, showPaste = true, className }: TabImportDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportedTab[]>([]);
  const [paste, setPaste] = useState('');
  const [tempo, setTempo] = useState('');
  const [quantize, setQuantize] = useState<8 | 16>(16);
  const [ts, setTs] = useState('4/4');
  const depth = useRef(0);

  const run = useCallback(
    async (input: File[] | string) => {
      setBusy(true);
      try {
        const [n, d] = ts.split('/').map(Number);
        const ascii: AsciiTabOptions = { quantize, timeSignature: [n || 4, d || 4] };
        if (Number(tempo) > 0) ascii.tempo = Number(tempo);
        const res = await importTabs(input, { ascii });
        setResults(res);
        onImported?.(res);
        if (typeof input === 'string' && res.every((r) => r.ok)) setPaste('');
      } finally {
        setBusy(false);
      }
    },
    [onImported, quantize, tempo, ts],
  );

  useEffect(() => {
    if (!global) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void run(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [global, run]);

  const localDrop = (e: React.DragEvent) => {
    if (global) return; // handled by the window listener
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void run(files);
  };

  return (
    <div
      className={`tab-import ${className ?? ''}`}
      style={box}
      onDragOver={(e) => {
        if (!global) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => !global && setDragging(false)}
      onDrop={localDrop}
    >
      <div style={zone} data-dragging={dragging || undefined}>
        <p style={{ margin: 0 }}>Tab dosyalarını buraya sürükle ya da seç.</p>
        <p style={muted}>Guitar Pro (gp3–gp7, gpx), MusicXML (.xml, .musicxml, .mxl), alphaTex (.atex, .tex), ASCII tab (.txt)</p>
        <label style={button}>
          {busy ? 'Yükleniyor…' : 'Dosya seç'}
          <input
            type="file"
            multiple
            accept={TAB_ACCEPT}
            hidden
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) void run(files);
            }}
          />
        </label>
      </div>

      {showPaste && (
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={muted} htmlFor="tab-import-paste">ASCII tab ya da alphaTex yapıştır</label>
          <textarea
            id="tab-import-paste"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={'e|-----0-----|\nB|---1---1---|\nG|-2-------2-|\nD|-----------|\nA|-----------|\nE|-----------|'}
            style={textarea}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={muted}>
              Tempo{' '}
              <input type="number" min={30} max={300} placeholder="90" value={tempo} onChange={(e) => setTempo(e.target.value)} style={{ ...input, width: 72 }} />
            </label>
            <label style={muted}>
              Ölçü{' '}
              <select value={ts} onChange={(e) => setTs(e.target.value)} style={input}>
                {['4/4', '3/4', '6/8', '2/4', '12/8'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label style={muted}>
              Izgara{' '}
              <select value={quantize} onChange={(e) => setQuantize(Number(e.target.value) as 8 | 16)} style={input}>
                <option value={16}>16’lık</option>
                <option value={8}>8’lik</option>
              </select>
            </label>
            <button type="button" style={button} disabled={busy || !paste.trim()} onClick={() => void run(paste)}>
              Dönüştür ve ekle
            </button>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }} aria-live="polite">
          {results.map((r, i) => (
            <li key={i} style={{ color: r.ok ? 'var(--tid-fg, var(--fg, inherit))' : 'var(--tid-error, var(--danger, #e5484d))' }}>
              {r.ok ? '✓' : '✕'} <b>{r.meta?.title ?? r.title ?? r.name}</b>
              {r.error ? ` — ${r.error}` : ''}
              {r.warnings.map((w, j) => (
                <div key={j} style={muted}>{w}</div>
              ))}
            </li>
          ))}
        </ul>
      )}

      {global && dragging && (
        <div style={overlay} aria-hidden>
          <div style={{ fontSize: 20 }}>Tabları bırak, kütüphaneye ekleyelim</div>
        </div>
      )}
    </div>
  );
}

const box: React.CSSProperties = { display: 'grid', gap: 12, color: 'var(--tid-fg, var(--fg, inherit))' };
const zone: React.CSSProperties = {
  display: 'grid',
  gap: 8,
  justifyItems: 'start',
  padding: 16,
  border: '1px dashed var(--tid-border, var(--border, #555))',
  borderRadius: 'var(--tid-radius, 8px)',
};
const muted: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--tid-muted, var(--muted, #8a8f98))' };
const button: React.CSSProperties = {
  display: 'inline-block',
  cursor: 'pointer',
  padding: '6px 12px',
  borderRadius: 'var(--tid-radius, 8px)',
  border: '1px solid var(--tid-border, var(--border, #555))',
  background: 'var(--tid-button-bg, transparent)',
  color: 'inherit',
  font: 'inherit',
};
const input: React.CSSProperties = { background: 'transparent', color: 'inherit', border: '1px solid var(--tid-border, var(--border, #555))', borderRadius: 4, padding: '2px 4px', font: 'inherit' };
const textarea: React.CSSProperties = { ...input, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13, width: '100%', boxSizing: 'border-box', padding: 8 };
const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'grid',
  placeItems: 'center',
  background: 'var(--tid-overlay, rgba(10, 12, 16, 0.75))',
  border: '3px dashed var(--tid-accent, var(--accent, #4c8dff))',
  pointerEvents: 'none',
};
