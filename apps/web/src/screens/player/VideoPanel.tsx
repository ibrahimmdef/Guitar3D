import { useEffect, useRef, useState } from 'react';
import { Crosshair, Minus, Plus, X } from 'lucide-react';
import { alignOffset, loadYouTubeApi, needsSeek, parseYouTube, videoRate, videoTimeFor, type VideoLink, type YTPlayer } from '../../player/youtube';
import { Button, IconButton } from '../../ui/kit';

interface Props {
  link: VideoLink;
  onChange: (l: VideoLink | null) => void;
  playing: boolean;
  /** alphaTab time (wall clock ms at the current speed) and speed; song time = timeMs * speed. */
  timeMs: number;
  speed: number;
}

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
  const songMs = timeMs * speed;
  const live = useRef({ songMs, link, playing });
  live.current = { songMs, link, playing };

  useEffect(() => {
    let alive = true;
    setReady(false);
    setError(null);
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
              setReady(true);
              yt.current?.seekTo(videoTimeFor(live.current.link, live.current.songMs), true);
              yt.current?.pauseVideo();
            },
            onError: () => alive && setError('Video oynatılamıyor (gömme kapalı ya da video yok).'),
          },
        });
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
      yt.current?.destroy();
      yt.current = null;
      el.remove();
    };
  }, [link.id]);

  // play / pause
  useEffect(() => {
    const p = yt.current;
    if (!p || !ready) return;
    if (playing) {
      p.seekTo(videoTimeFor(live.current.link, live.current.songMs), true);
      p.playVideo();
    } else p.pauseVideo();
  }, [playing, ready]);

  // speed
  useEffect(() => {
    if (ready) yt.current?.setPlaybackRate(videoRate(speed));
  }, [speed, ready]);

  // seeks, loop jumps and drift
  const lastFix = useRef(0);
  const lastSong = useRef(songMs);
  useEffect(() => {
    const p = yt.current;
    const prev = lastSong.current;
    lastSong.current = songMs;
    if (!p || !ready) return;
    const target = videoTimeFor(link, songMs);
    const now = performance.now();
    if (needsSeek({ playing, prevSongMs: prev, songMs, videoSec: p.getCurrentTime(), targetSec: target, msSinceFix: now - lastFix.current, ytState: p.getPlayerState() })) {
      lastFix.current = now;
      p.seekTo(target, true);
      if (playing) p.playVideo();
    }
  }, [songMs, playing, ready, link]);

  // A new offset (nudge, align) moves the video to the matching moment.
  useEffect(() => {
    if (ready) yt.current?.seekTo(videoTimeFor(live.current.link, live.current.songMs), true);
  }, [link.offset, ready]);

  const align = () => {
    const p = yt.current;
    if (!p) return;
    onChange({ ...link, offset: alignOffset(p.getCurrentTime(), songMs) });
  };
  const nudge = (d: number) => onChange({ ...link, offset: Math.round((link.offset + d) * 100) / 100 });

  return (
    <div className="stage-video" role="region" aria-label="Video">
      <div className="sv-frame" ref={host}>
        {error && <p className="sv-error">{error}</p>}
      </div>
      <div className="sv-bar">
        <Button size="sm" variant="ghost" icon={<Crosshair size={14} />} onClick={align} disabled={!ready || playing}>
          Videoyu bu ana hizala
        </Button>
        <IconButton size="sm" label="Video 0,1 sn geri" icon={<Minus size={14} />} onClick={() => nudge(-0.1)} />
        <span className="num small subtle" title="Tab başına denk gelen video anı">{link.offset.toFixed(1)} sn</span>
        <IconButton size="sm" label="Video 0,1 sn ileri" icon={<Plus size={14} />} onClick={() => nudge(0.1)} />
        <IconButton size="sm" label="Videoyu kaldır" icon={<X size={14} />} onClick={() => onChange(null)} />
      </div>
    </div>
  );
}

/** Drawer section: paste a YouTube link for this tab. */
export function VideoLinkField({ link, onChange }: { link: VideoLink | null; onChange: (l: VideoLink | null) => void }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState(false);
  const add = () => {
    const l = parseYouTube(url);
    setErr(!l);
    if (l) {
      onChange(l);
      setUrl('');
    }
  };
  return (
    <section className="drawer-sec" aria-labelledby="video-sec">
      <h3 id="video-sec" className="eyebrow">Video</h3>
      {link ? (
        <p className="subtle small">Video sahnede. Tab ile birlikte oynar, durur, hız ve döngüyü izler. Hizalamak için tabı durdur, videoyu tab imlecinin olduğu ana getir ve “Videoyu bu ana hizala”ya bas.</p>
      ) : (
        <>
          <form
            className="ti-row"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input className="input" style={{ flex: 1 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="YouTube bağlantısı" aria-label="YouTube bağlantısı" />
            <Button size="sm" type="submit" disabled={!url.trim()}>Ekle</Button>
          </form>
          {err && <p className="ti-err small">Bu bir YouTube bağlantısı gibi görünmüyor.</p>}
        </>
      )}
    </section>
  );
}
