import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import type { TabMeta } from '@guitar3d/shared';
import { Button, Spinner } from '../../ui/kit';
import { uploadTab } from '../data';

/**
 * INTEGRATION POINT (workstream B).
 *
 * Placeholder for B's `TabImportDropzone` (apps/web/src/tabs/). The library screen renders
 * <TabImportSlot onImported onError />. When B lands, replace this component's body with
 *
 *   return <TabImportDropzone onImported={onImported} onError={onError} />;
 *
 * (adapting prop names if B's differ). Until then it uploads Guitar Pro / MusicXML files to
 * POST /api/tabs, one request per file.
 */
export interface TabImportSlotProps {
  onImported: (tabs: TabMeta[]) => void;
  onError: (message: string) => void;
  /** A PDF or image dropped here is read in the image / PDF import dialog instead of uploaded. */
  onReadable?: (file: File) => void;
}

const ACCEPT = '.gp,.gp3,.gp4,.gp5,.gpx,.gp7,.xml,.musicxml,.mxl,.pdf,image/*';
const readable = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name) || f.type.startsWith('image/');

export function TabImportSlot({ onImported, onError, onReadable }: TabImportSlotProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(0);

  const handle = async (files: FileList | File[]) => {
    let list = [...files];
    const other = onReadable ? list.find(readable) : undefined;
    if (other) onReadable!(other);
    list = list.filter((f) => !(onReadable && readable(f)));
    if (!list.length) return;
    setBusy(list.length);
    const ok: TabMeta[] = [];
    for (const f of list) {
      try {
        ok.push(await uploadTab(f));
      } catch (e) {
        onError(`${f.name}: ${(e as Error).message}`);
      }
      setBusy((n) => n - 1);
    }
    if (ok.length) onImported(ok);
  };

  return (
    <div
      className={`dropzone${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
    >
      <div className="dropzone-ic" aria-hidden>{busy ? <Spinner /> : <Upload size={20} />}</div>
      <div className="dropzone-text">
        <p className="dropzone-title">{busy ? `Uploading ${busy} files…` : 'Drop tab files here'}</p>
        <p className="dropzone-desc">Guitar Pro (.gp, .gp3–.gp7, .gpx) and MusicXML give the most accurate results. PDFs and tab images can be read too.</p>
      </div>
      <Button variant="secondary" onClick={() => input.current?.click()} disabled={!!busy}>Choose files</Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={ACCEPT}
        onChange={(e) => {
          if (e.target.files) handle(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
