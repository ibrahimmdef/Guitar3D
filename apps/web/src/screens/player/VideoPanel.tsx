import { useEffect, useRef, useState } from 'react';
import { Crosshair, ExternalLink, Maximize2, Minimize2, Minus, Plus, X } from 'lucide-react';
import { alignOffset, loadYouTubeApi, needsSeek, parseYouTube, thumbUrl, videoRate, videoTimeFor, watchUrl, ytErrorMessage, type VideoLink, type YTPlayer } from '../../player/youtube';
import { Button, IconButton } from '../../ui/kit';

interface Props {
  link: VideoLink;
  onChange: (l: VideoLink | null) => void;
  playing: boolean;
  /** alphaTab time (wall clock ms at the current speed) and speed; song time = timeMs * speed. */
  timeMs: number;
  speed: number;
}

const BIG_KEY = 'guitar3d.videoBig';

/**
 * YouTube video floating on the stage, following the tab player: play/pause, seeks and loop jumps
 * (by drift correction), and speed. One offset aligns the two: scrub the video to the moment that
 * matches the tab cursor and press "Bu ana hizala".
 */
export function VideoPanel({ link, onChange, playing, timeMs, speed }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const yt = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Until the first play the YouTube poster is shown instead of a (often black) first frame.
  const [started, setStarted] = useState(false);
  const [big, setBig] = useState(() => {
    try {
      return localStorage.getItem(BIG_KEY) === '1';
    } catch {
      return false;
    }
  });
  const songMs = timeMs * speed;
  const live = useRef({ songMs, link, playing });
  live.current = { songMs, link, playing };

  useEffect(() => {
    let alive = true;
    setReady(false);
    setError(null);
    setStarted(false);
    const el = document.createElement('div');
    host.current?.appendChild(el);
    loadYouTubeApi()
      .then((YT) => {
        if (!alive) return;
        yt.current = new YT.Player(el, {
          videoId: link.id,
          width: '100%',
          height: '100%',
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: () => {
              if (!alive) return;
              if (import.meta.env.DEV) (window as unknown as { __yt: YTPlayer | null }).__yt = yt.current;
              setReady(true);
            },
            onError: (e) => alive && setError(ytErrorMessage(e.data)),
          },
        });
      })
      .catch(() => alive && setError('YouTube yüklenemedi. İnternet bağlantını kontrol et.'));
    return () => {
      alive = false;
      yt.current?.destroy();
      yt.current = null;
      el.remove();
    };
  }, [link.id]);

  // Play / pause. The tab may count in first: the video waits on the right frame and starts when
  // the tab really starts moving (see the drift effect below).
  const waiting = useRef<number | null>(null);
  useEffect(() => {
    const p = yt.current;
    if (!p || !ready) return;
    if (playing) {
      setStarted(true);
      p.seekTo(videoTimeFor(live.current.link, live.current.songMs), true);
      p.pauseVideo();
      waiting.current = live.current.songMs;
    } else {
      waiting.current = null;
      p.pauseVideo();
    }
  }, [playing, ready]);

  // speed
  useEffect(() => {
    if (ready) yt.current?.setPlaybackRate(videoRate(speed));
  }, [speed, ready]);

  // seeks, loop jumps and drift
  const lastFix = useRef(0);
  const startedAt = useRef(0);
  const lastSong = useRef(songMs);
  useEffect(() => {
    const p = yt.current;
    const prev = lastSong.current;
    lastSong.current = songMs;
    if (!p || !ready) return;
    const target = videoTimeFor(link, songMs);
    if (playing && waiting.current != null) {
      if (songMs - waiting.current < 20) return; // count-in: tab not moving yet
      waiting.current = null;
      p.seekTo(target, true);
      p.playVideo();
      lastFix.current = performance.now();
      startedAt.current = lastFix.current;
      return;
    }
    const now = performance.now();
    // YouTube takes a moment to get going after play/seek, so it starts a little behind: in the first
    // seconds tighten the sync once it is really playing.
    if (playing && now - startedAt.current < 4000 && now - lastFix.current > 700 && p.getPlayerState() === 1) {
      const lag = target - p.getCurrentTime();
      if (Math.abs(lag) > 0.1) {
        lastFix.current = now;
        p.seekTo(target + Math.max(0, Math.min(0.3, lag * 0.5)), true);
        return;
      }
    }
    if (needsSeek({ playing, prevSongMs: prev, songMs, videoSec: p.getCurrentTime(), targetSec: target, msSinceFix: now - lastFix.current, ytState: p.getPlayerState() })) {
      lastFix.current = now;
      p.seekTo(target, true);
      if (playing) p.playVideo();
      else setStarted(true);
    }
  }, [songMs, playing, ready, link]);

  // A new offset (nudge, align) moves the video to the matching moment.
  const firstOffset = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (firstOffset.current) {
      firstOffset.current = false;
      if (live.current.link.offset < 0.5 && live.current.songMs < 500) return; // keep the poster
    }
    setStarted(true);
    yt.current?.seekTo(videoTimeFor(live.current.link, live.current.songMs), true);
  }, [link.offset, ready]);

  const align = () => {
    const p = yt.current;
    if (!p) return;
    onChange({ ...link, offset: alignOffset(p.getCurrentTime(), songMs) });
  };
  const nudge = (d: number) => onChange({ ...link, offset: Math.round((link.offset + d) * 100) / 100 });
  const toggleBig = () => {
    setBig((b) => {
      try {
        localStorage.setItem(BIG_KEY, b ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !b;
    });
  };

  return (
    <div className={`stage-video${big ? ' is-big' : ''}`} role="region" aria-label="Video">
      <div className="sv-frame" ref={host}>
        {!started && !error && (
          <button type="button" className="sv-poster" onClick={() => setStarted(true)} aria-label="Video hazır; tabı çalınca birlikte başlar">
            <img src={thumbUrl(link.id)} alt="" />
            <span className="sv-poster-hint">{ready ? 'Tabı çalınca video da başlar' : 'Video yükleniyor…'}</span>
          </button>
        )}
        {error && (
          <div className="sv-error" role="alert">
            <p>{error}</p>
            <a className="btn btn-secondary btn-sm" href={watchUrl(link)} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> YouTube'da aç
            </a>
          </div>
        )}
      </div>
      <div className="sv-bar">
        <Button size="sm" variant="ghost" icon={<Crosshair size={14} />} onClick={align} disabled={!ready || playing} title="Tabı durdur, videoyu tab imlecinin olduğu ana getir ve bas">
          Bu ana hizala
        </Button>
        <IconButton size="sm" label="Video 0,1 sn geri" icon={<Minus size={14} />} onClick={() => nudge(-0.1)} />
        <span className="num small subtle" title="Tab başına denk gelen video anı">{link.offset.toFixed(1)} sn</span>
        <IconButton size="sm" label="Video 0,1 sn ileri" icon={<Plus size={14} />} onClick={() => nudge(0.1)} />
        <span className="sv-spacer" />
        <IconButton size="sm" label={big ? 'Videoyu küçült' : 'Videoyu büyüt'} icon={big ? <Minimize2 size={14} /> : <Maximize2 size={14} />} onClick={toggleBig} />
        <IconButton size="sm" label="Videoyu kaldır" icon={<X size={14} />} onClick={() => onChange(null)} />
      </div>
    </div>
  );
}

/** Paste a YouTube link for this tab (drawer section, or the top-bar video dialog with `bare`). */
export function VideoLinkField({ link, onChange, bare = false, autoFocus = false }: { link: VideoLink | null; onChange: (l: VideoLink | null) => void; bare?: boolean; autoFocus?: boolean }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState(false);
  const add = (text = url) => {
    const l = parseYouTube(text);
    setErr(!l);
    if (l) {
      onChange(l);
      setUrl('');
    }
  };
  const body = link ? (
    <p className="subtle small">Video sahnede. Tab ile birlikte oynar, durur, hız ve döngüyü izler. Hizalamak için tabı durdur, videoyu tab imlecinin olduğu ana getir ve “Bu ana hizala”ya bas.</p>
  ) : (
    <>
      <form
        className="ti-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="input"
          style={{ flex: 1 }}
          value={url}
          autoFocus={autoFocus}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (parseYouTube(text)) {
              e.preventDefault();
              add(text);
            }
          }}
          placeholder="youtube.com/watch?v=… ya da youtu.be/…"
          aria-label="YouTube bağlantısı"
        />
        <Button size="sm" type="submit" disabled={!url.trim()}>Ekle</Button>
      </form>
      {err && <p className="ti-err small">Bu bir YouTube bağlantısı gibi görünmüyor.</p>}
    </>
  );
  if (bare) return body;
  return (
    <section className="drawer-sec" aria-labelledby="video-sec">
      <h3 id="video-sec" className="eyebrow">Video</h3>
      {body}
    </section>
  );
}
