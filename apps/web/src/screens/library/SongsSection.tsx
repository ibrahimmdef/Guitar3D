import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, AudioLines, Play, Trash, Upload } from 'lucide-react';
import type { SeparatorStatus, Song } from '@guitar3d/shared';
import { Button, Dialog, IconButton, Spinner, useToast } from '../../ui/kit';
import { navigate, playSong } from '../../ui/router';
import { formatTime } from '../../songs/mixer';
import { deleteSong, listSongs, separatorStatus, SONG_ACCEPT, SONG_MAX_MB, uploadSong } from '../data';

const pending = (s: Song) => s.status === 'queued' || s.status === 'separating';

function statusText(s: Song) {
  switch (s.status) {
    case 'queued':
      return 'Queued';
    case 'separating':
      return `Separating ${Math.round(s.progress * 100)}%`;
    case 'ready':
      return 'Ready';
    default:
      return 'Error';
  }
}

/**
 * "My songs": audio files split into stems (guitar, vocals, bass, drums, piano, other) so the
 * player can mute the original guitar and play along with the band.
 */
export function SongsSection() {
  const toast = useToast();
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [sep, setSep] = useState<SeparatorStatus | null>(null);
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const [confirm, setConfirm] = useState<Song | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => listSongs().then(setSongs).catch(() => setSongs((x) => x ?? [])), []);
  useEffect(() => {
    void load();
    separatorStatus().then(setSep).catch(() => {});
  }, [load]);

  // Poll while something is being separated.
  const anyPending = songs?.some(pending) ?? false;
  useEffect(() => {
    if (!anyPending) return;
    const t = window.setInterval(load, 2000);
    return () => clearInterval(t);
  }, [anyPending, load]);

  const handle = async (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    setBusy(list.length);
    for (const f of list) {
      try {
        const s = await uploadSong(f);
        setSongs((x) => [s, ...(x ?? [])]);
        toast({ tone: 'success', title: `“${s.title}” added.`, description: 'Splitting the instruments; open the card when it is ready.' });
      } catch (e) {
        toast({ tone: 'danger', title: `Could not upload ${f.name}.`, description: (e as Error).message, durationMs: 7000 });
      }
      setBusy((n) => n - 1);
    }
  };

  const remove = async (s: Song) => {
    setConfirm(null);
    try {
      await deleteSong(s.id);
      setSongs((x) => x?.filter((y) => y.id !== s.id) ?? null);
      toast({ tone: 'info', title: `“${s.title}” deleted.` });
    } catch (e) {
      toast({ tone: 'danger', title: 'Could not delete the song.', description: (e as Error).message });
    }
  };

  return (
    <section className="lib-sec" aria-labelledby="sec-songs">
      <div className="sec-head">
        <h2 id="sec-songs">My songs</h2>
      </div>
      <p className="subtle small">Upload a song and it is split into guitar, vocals, bass, drums, piano and other. Mute the original guitar and play along with the band.</p>

      {sep && !sep.available && (
        <div className="song-setup" role="note">
          <AlertTriangle size={16} aria-hidden />
          <div>
            <p>{sep.reason}</p>
            {sep.setupHint && <p className="subtle small">{sep.setupHint}</p>}
          </div>
        </div>
      )}

      {songs === null ? (
        <div className="lib-loading" role="status"><Spinner label="Loading songs" /> Loading songs…</div>
      ) : (
        songs.length > 0 && (
          <ul className="lib-grid" aria-label="Songs">
            {songs.map((s) => (
              <li key={s.id} className="tab-card-wrap">
                <button type="button" className="tab-card song-card" onClick={() => navigate(playSong(s.id))}>
                  <span className="tab-card-ic" aria-hidden><AudioLines size={18} /></span>
                  <span className="tab-card-title">{s.title}</span>
                  <span className="tab-card-sub">{[s.artist || 'Unknown artist', s.duration ? formatTime(s.duration) : ''].filter(Boolean).join(' · ')}</span>
                  <span className="tab-card-meta">
                    <span className={`song-badge is-${s.status}`}>{statusText(s)}</span>
                    {s.status === 'error' && s.error && <span className="song-card-err" title={s.error}>{s.error}</span>}
                  </span>
                  {pending(s) && (
                    <span className="tab-card-progress" aria-hidden>
                      <span className="bar"><span style={{ width: `${s.progress * 100}%` }} /></span>
                    </span>
                  )}
                  {s.status === 'ready' && <span className="tab-card-play" aria-hidden><Play size={16} fill="currentColor" /></span>}
                </button>
                <IconButton className="tab-card-del" label={`Delete “${s.title}”`} icon={<Trash size={16} />} size="sm" onClick={() => setConfirm(s)} />
              </li>
            ))}
          </ul>
        )
      )}

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
          void handle(e.dataTransfer.files);
        }}
      >
        <div className="dropzone-ic" aria-hidden>{busy ? <Spinner /> : <AudioLines size={20} />}</div>
        <div className="dropzone-text">
          <p className="dropzone-title">{busy ? `Uploading ${busy} file${busy > 1 ? 's' : ''}…` : 'Drop an audio file here'}</p>
          <p className="dropzone-desc">MP3, WAV, FLAC, OGG or M4A, up to {SONG_MAX_MB} MB.</p>
        </div>
        <Button variant="secondary" icon={<Upload size={15} />} onClick={() => input.current?.click()} disabled={!!busy}>From audio file</Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={SONG_ACCEPT}
          onChange={(e) => {
            if (e.target.files) void handle(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <Dialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete song?"
        description={confirm ? `“${confirm.title}” and all its separated stems will be deleted permanently.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" icon={<Trash size={15} />} onClick={() => confirm && remove(confirm)}>Delete</Button>
          </>
        }
      />
    </section>
  );
}
