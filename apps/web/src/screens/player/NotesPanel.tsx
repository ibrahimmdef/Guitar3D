import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { BarNote } from '@guitar3d/shared';
import { Button, IconButton } from '../../ui/kit';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const notesApi = {
  list: (tabKey: string) => fetch(`/api/notes?tabKey=${encodeURIComponent(tabKey)}`).then((r) => json<BarNote[]>(r)),
  add: (n: Pick<BarNote, 'tabKey' | 'bar' | 'text'>) =>
    fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(n) }).then((r) => json<BarNote>(r)),
  remove: (id: string) => fetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

/** Bar notes of one tab (server-side). */
export function useBarNotes(tabKey: string) {
  const [notes, setNotes] = useState<BarNote[]>([]);
  const refresh = useCallback(() => notesApi.list(tabKey).then(setNotes).catch(() => setNotes([])), [tabKey]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { notes, refresh };
}

interface Props {
  tabKey: string;
  notes: BarNote[];
  refresh: () => void;
  currentBar: number;
  onSeekBar: (bar: number) => void;
}

/** Drawer section: text notes on bars (own reminders). */
export function NotesPanel({ tabKey, notes, refresh, currentBar, onSeekBar }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await notesApi.add({ tabKey, bar: currentBar, text: text.trim() });
      setText('');
      refresh();
    } catch {
      /* server unavailable: keep the text */
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="drawer-sec" aria-labelledby="notes-sec">
      <h3 id="notes-sec" className="eyebrow">Ölçü notları</h3>
      {notes.length > 0 && (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id} className={n.bar === currentBar ? 'is-now' : undefined}>
              <button type="button" className="note-bar num" onClick={() => onSeekBar(n.bar)} aria-label={`${n.bar + 1}. ölçüye git`}>{n.bar + 1}</button>
              <span className="note-text">{n.text}</span>
              <IconButton size="sm" label="Notu sil" icon={<Trash2 size={14} />} onClick={() => void notesApi.remove(n.id).then(refresh)} />
            </li>
          ))}
        </ul>
      )}
      <form
        className="ti-row"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input className="input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={`${currentBar + 1}. ölçüye not`} aria-label={`${currentBar + 1}. ölçüye not`} maxLength={1000} />
        <Button size="sm" type="submit" disabled={busy || !text.trim()}>Ekle</Button>
      </form>
    </section>
  );
}
