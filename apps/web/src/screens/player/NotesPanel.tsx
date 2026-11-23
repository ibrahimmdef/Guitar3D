import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { BarNote } from '@guitar3d/shared';
import { Button, IconButton } from '../../ui/kit';
import { addNote, deleteNote, listNotes } from '../../storage/library';

const notesApi = { list: listNotes, add: addNote, remove: deleteNote };

/** Bar notes of one tab. */
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
      /* not saved (storage unavailable): keep the text */
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="drawer-sec" aria-labelledby="notes-sec">
      <h3 id="notes-sec" className="eyebrow">Bar notes</h3>
      {notes.length > 0 && (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id} className={n.bar === currentBar ? 'is-now' : undefined}>
              <button type="button" className="note-bar num" onClick={() => onSeekBar(n.bar)} aria-label={`Go to bar ${n.bar + 1}`}>{n.bar + 1}</button>
              <span className="note-text">{n.text}</span>
              <IconButton size="sm" label="Delete note" icon={<Trash2 size={14} />} onClick={() => void notesApi.remove(n.id).then(refresh)} />
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
        <input className="input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Note for bar ${currentBar + 1}`} aria-label={`Note for bar ${currentBar + 1}`} maxLength={1000} />
        <Button size="sm" type="submit" disabled={busy || !text.trim()}>Add</Button>
      </form>
    </section>
  );
}
