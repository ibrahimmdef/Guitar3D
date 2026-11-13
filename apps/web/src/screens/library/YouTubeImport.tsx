import { useEffect, useMemo, useState } from 'react';
import { FileText, Image as ImageIcon, Play, Search, Sparkles } from 'lucide-react';
import type { TabMeta } from '@guitar3d/shared';
import { fetchVideoInfo, parseYouTube, thumbUrl, titleMatch, type VideoLink } from '../../player/youtube';
import { writeTabSetup } from '../../player/tabSetup';
import { Button, Dialog } from '../../ui/kit';
import { navigate, playLesson, playTab, type Route } from '../../ui/router';
import type { LessonMeta } from './lessons';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tabs: TabMeta[];
  lessons: LessonMeta[];
  /** Start a new tab for this video from pasted text or a screenshot. */
  onNewTab: (kind: 'text' | 'image', link: VideoLink) => void;
}

interface Candidate {
  key: string;
  title: string;
  sub: string;
  route: Route;
  score: number;
}

const norm = (s: string) => s.toLocaleLowerCase('tr');

/**
 * Library → "YouTube'dan": paste a link, see the video, then pick the tab to practise it with (the
 * best title matches first) or start a new one from text / a screenshot. The link is stored with the
 * tab, so the player opens with the video synced to it.
 */
export function YouTubeImportDialog({ open, onOpenChange, tabs, lessons, onNewTab }: Props) {
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const link = useMemo(() => parseYouTube(url), [url]);
  const [info, setInfo] = useState<{ title: string; author: string } | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  useEffect(() => {
    setInfo(null);
    if (!link) return;
    let alive = true;
    setLoadingInfo(true);
    fetchVideoInfo(link.id)
      .then((i) => alive && setInfo(i))
      .finally(() => alive && setLoadingInfo(false));
    return () => {
      alive = false;
    };
  }, [link?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const candidates = useMemo(() => {
    const videoText = info ? `${info.title} ${info.author}` : '';
    const all: Candidate[] = [
      ...tabs.map((t) => ({ key: t.id, title: t.title || t.fileName, sub: t.artist || 'Kendi tabın', route: playTab(t.id), score: 0 })),
      ...lessons.map((l) => ({ key: `lesson:${l.id}`, title: l.title, sub: 'Ders', route: playLesson(l.id), score: 0 })),
    ].map((c) => ({ ...c, score: videoText ? titleMatch(videoText, `${c.title} ${c.sub === 'Ders' || c.sub === 'Kendi tabın' ? '' : c.sub}`) : 0 }));
    const q = norm(query.trim());
    return all
      .filter((c) => !q || norm(`${c.title} ${c.sub}`).includes(q))
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'tr'));
  }, [tabs, lessons, info, query]);

  const choose = (c: Candidate) => {
    if (!link) return;
    writeTabSetup(c.key, { video: link });
    onOpenChange(false);
    navigate(c.route);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="YouTube'dan çalış" description="Videonun bağlantısını yapıştır, sonra hangi tabla çalışacağını seç. Video tabla birlikte oynar; hız ve döngüyü izler." size="lg">
      <div className="yt-import">
        <input
          className="input"
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          aria-label="YouTube bağlantısı"
        />
        {url.trim() && !link && <p className="ti-err small">Bu bir YouTube bağlantısı gibi görünmüyor.</p>}

        {link && (
          <div className="yt-video">
            <img src={thumbUrl(link.id)} alt="" />
            <div>
              <p className="yt-title">{info?.title ?? (loadingInfo ? 'Video bilgisi alınıyor…' : 'YouTube videosu')}</p>
              {info?.author && <p className="subtle small">{info.author}</p>}
              {link.offset > 0 && <p className="subtle small">Başlangıç: {Math.round(link.offset)} sn</p>}
            </div>
          </div>
        )}

        {link && (
          <>
            <div className="yt-pick-head">
              <h3 className="eyebrow">Hangi tabla çalışacaksın?</h3>
              <label className="yt-search">
                <Search size={14} aria-hidden />
                <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tab ara" aria-label="Tab ara" />
              </label>
            </div>
            <ul className="yt-list" aria-label="Tablar ve dersler">
              {candidates.slice(0, 40).map((c) => (
                <li key={c.key}>
                  <button type="button" className="yt-row" onClick={() => choose(c)}>
                    <span className="yt-row-text">
                      <span className="yt-row-title">{c.title}</span>
                      <span className="subtle small">{c.sub}</span>
                    </span>
                    {c.score >= 0.5 && <span className="yt-match"><Sparkles size={12} aria-hidden /> Eşleşiyor</span>}
                    <Play size={14} aria-hidden className="yt-row-go" />
                  </button>
                </li>
              ))}
              {!candidates.length && <li className="subtle small yt-empty">Aramana uyan tab yok.</li>}
            </ul>
            <div className="yt-new">
              <span className="subtle small">Bu şarkının tabı yok mu? Ekle, video ona bağlansın:</span>
              <Button size="sm" variant="secondary" icon={<FileText size={14} />} onClick={() => onNewTab('text', link)}>Metinden</Button>
              <Button size="sm" variant="secondary" icon={<ImageIcon size={14} />} onClick={() => onNewTab('image', link)}>Görselden</Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
