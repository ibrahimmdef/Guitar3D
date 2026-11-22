import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, AudioLines, Link2, Play, RotateCcw, Trash, Upload } from 'lucide-react';
import type { SeparatorStatus, Song } from '@guitar3d/shared';
import { Button, Dialog, IconButton, Spinner, useToast } from '../../ui/kit';
import { navigate, playSong } from '../../ui/router';
import { formatTime } from '../../songs/mixer';
import { addSongFromLink, deleteSong, findLink, listSongs, retrySong, separatorStatus, SONG_ACCEPT, SONG_MAX_MB, uploadSong } from '../data';

const pending = (s: Song) => s.status === 'queued' || s.status === 'downloading' || s.status === 'separating';

function statusText(s: Song) {
  switch (s.status) {
    case 'queued':
      return 'Queued';
    case 'downloading':
      return `Downloading ${Math.round(s.progress * 100)}%`;
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
  const linkInput = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkOk = sep?.linkImport?.available ?? false;

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

  const addLink = async () => {
    const url = link.trim();
    if (!url || linkBusy) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      const s = await addSongFromLink(url);
      setSongs((x) => [s, ...(x ?? [])]);
      setLink('');
      toast({ tone: 'success', title: 'Song added from link.', description: 'Downloading the audio, then splitting the instruments.' });
    } catch (e) {
      setLinkError((e as Error).message);
    } finally {
      setLinkBusy(false);
    }
  };

  // Pasting a link anywhere on the library screen (outside a text field) fills the link box.
  useEffect(() => {
    if (!linkOk) return;
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, [contenteditable="true"]') || t.closest('[role="dialog"]'))) return;
      const url = findLink(e.clipboardData?.getData('text') ?? '');
      if (!url) return;
      e.preventDefault();
      setLink(url);
      setLinkError(null);
      linkInput.current?.focus();
      linkInput.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [linkOk]);

  const retry = async (s: Song) => {
    try {
      const updated = await retrySong(s.id);
      setSongs((x) => x?.map((y) => (y.id === s.id ? updated : y)) ?? null);
    } catch (e) {
      toast({ tone: 'danger', title: 'Could not retry.', description: (e as Error).message });
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
                {s.status === 'error' && (
                  <Button className="song-card-retry" variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={() => void retry(s)}>Retry</Button>
                )}
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

      {sep && (
        <div className="song-link">
          <form
            className="song-link-row"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void addLink();
            }}
          >
            <label className="sr-only" htmlFor="song-link-url">Song or video link</label>
            <span className="song-link-ic" aria-hidden><Link2 size={16} /></span>
            <input
              id="song-link-url"
              ref={linkInput}
              className="input"
              type="url"
              inputMode="url"
              placeholder={linkOk ? 'Paste a YouTube, SoundCloud, Vimeo… link' : 'Adding from a link is unavailable'}
              value={link}
              disabled={!linkOk || linkBusy}
              aria-invalid={!!linkError}
              aria-describedby="song-link-note"
              onChange={(e) => {
                setLink(e.target.value);
                setLinkError(null);
              }}
            />
            <Button type="submit" variant="secondary" icon={linkBusy ? <Spinner /> : <Link2 size={15} />} disabled={!linkOk || linkBusy || !link.trim()}>From link</Button>
          </form>
          {linkError && <p className="song-link-err" role="alert">{linkError}</p>}
          <p id="song-link-note" className="subtle small">
            {linkOk
              ? 'Only add songs you have the right to use for personal practice.'
              : [sep.linkImport?.reason ?? 'Adding songs from links is unavailable on this server.', sep.linkImport?.setupHint].filter(Boolean).join(' ')}
          </p>
        </div>
      )}

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
