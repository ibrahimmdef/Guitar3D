import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, CloudOff, FileMusic, GraduationCap, Guitar, Play, Search, Trash, Upload } from 'lucide-react';
import type { TabMeta, TabProgress } from '@guitar3d/shared';
import { Button, Dialog, EmptyState, IconButton, SegmentedControl, Spinner, useToast } from '../../ui/kit';
import { navigate, playLesson, playTab } from '../../ui/router';
import { getRecent } from '../../ui/settings';
import { relativeTime } from '../../ui/format';
import { ScreenHeader } from '../AppShell';
import { bestSpeed, deleteTab, getProgress, listTabs } from '../data';
import { groupByLevel, LEVEL_LABEL, listLessons, type LessonMeta } from './lessons';
import { TabImportSlot } from './TabImportSlot';

type Sort = 'recent' | 'title' | 'added';

const collator = new Intl.Collator('tr');
const norm = (s: string) => s.toLocaleLowerCase('tr');

export function LibraryScreen() {
  const toast = useToast();
  const [tabs, setTabs] = useState<TabMeta[] | null>(null);
  const [lessons, setLessons] = useState<LessonMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, TabProgress>>({});
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [confirm, setConfirm] = useState<TabMeta | null>(null);
  const recent = useMemo(() => getRecent(), []);

  const load = useCallback(() => {
    setError(null);
    listTabs()
      .then((ts) => {
        setTabs(ts);
        ts.forEach((t) => getProgress(t.id).then((p) => setProgress((x) => ({ ...x, [t.id]: p }))).catch(() => {}));
      })
      .catch(() => {
        setTabs([]);
        setError('Sunucuya ulaşılamadı, kendi tabların şu an gösterilemiyor. Dersler yine de çalışır.');
      });
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    listLessons().then(setLessons).catch(() => setLessons([]));
  }, []);

  const q = norm(query.trim());
  const visibleTabs = useMemo(() => {
    const list = (tabs ?? []).filter((t) => !q || norm(`${t.title} ${t.artist} ${t.fileName}`).includes(q));
    return [...list].sort((a, b) => {
      if (sort === 'title') return collator.compare(a.title, b.title);
      if (sort === 'added') return b.uploadedAt.localeCompare(a.uploadedAt);
      return (recent[b.id] ?? b.uploadedAt).localeCompare(recent[a.id] ?? a.uploadedAt);
    });
  }, [tabs, q, sort, recent]);
  const visibleLessons = useMemo(() => (lessons ?? []).filter((l) => !q || norm(`${l.title} ${l.description ?? ''}`).includes(q)), [lessons, q]);

  const firstRun = tabs !== null && tabs.length === 0;
  const firstLesson = lessons?.find((l) => l.level === 'beginner') ?? lessons?.[0];

  const remove = async (t: TabMeta) => {
    setConfirm(null);
    try {
      await deleteTab(t.id);
      setTabs((x) => x?.filter((y) => y.id !== t.id) ?? null);
      toast({ tone: 'info', title: `“${t.title}” silindi.` });
    } catch (e) {
      toast({ tone: 'danger', title: 'Tab silinemedi.', description: (e as Error).message });
    }
  };

  const importer = (
    <TabImportSlot
      onImported={(added) => {
        setTabs((x) => [...added, ...(x ?? []).filter((t) => !added.some((a) => a.id === t.id))]);
        toast({
          tone: 'success',
          title: added.length === 1 ? `“${added[0].title}” eklendi.` : `${added.length} tab eklendi.`,
          description: added.length === 1 ? 'Açmak için karta tıkla.' : undefined,
        });
      }}
      onError={(m) => toast({ tone: 'danger', title: 'Dosya yüklenemedi.', description: m, durationMs: 7000 })}
    />
  );

  return (
    <div className="screen">
      <ScreenHeader title="Kütüphane" description={firstRun ? undefined : 'Bir tab ya da ders seç, 3D gitarda çalışmaya başla.'} />

      {firstRun && !error && (
        <section className="welcome" aria-labelledby="welcome-title">
          <h2 id="welcome-title">Hoş geldin. Nereden başlayalım?</h2>
          <ol className="welcome-steps">
            <WelcomeStep
              n={1}
              icon={<GraduationCap size={20} />}
              title="İlk dersini çal"
              text={firstLesson ? `“${firstLesson.title}” ile başla. Notalar gitarın üzerinde gösterilir.` : 'Hazır derslerden biriyle başla.'}
              action={firstLesson && <Button variant="primary" icon={<Play size={15} fill="currentColor" />} onClick={() => navigate(playLesson(firstLesson.id))}>Derse başla</Button>}
            />
            <WelcomeStep
              n={2}
              icon={<Guitar size={20} />}
              title="Gitarını ekle"
              text="İki fotoğrafla kendi gitarını oluştur. İstersen yerleşik modelle devam et."
              action={<Button variant="secondary" iconRight={<ArrowRight size={15} />} onClick={() => navigate({ name: 'guitar' })}>Gitarım</Button>}
            />
            <WelcomeStep
              n={3}
              icon={<Upload size={20} />}
              title="Kendi tabını yükle"
              text="Guitar Pro veya MusicXML dosyanı aşağıdaki alana bırak."
            />
          </ol>
        </section>
      )}

      {(tabs === null || tabs.length > 0 || error) && (
        <section className="lib-sec" aria-labelledby="sec-tabs">
          <div className="sec-head">
            <h2 id="sec-tabs">Tablarım</h2>
            {tabs && tabs.length > 0 && (
              <SegmentedControl
                aria-label="Sıralama"
                value={sort}
                onChange={setSort}
                size="sm"
                options={[
                  { value: 'recent', label: 'Son çalınan' },
                  { value: 'title', label: 'Ad' },
                  { value: 'added', label: 'Eklenme' },
                ]}
              />
            )}
          </div>
          {(tabs?.length ?? 0) + (lessons?.length ?? 0) > 6 && (
            <label className="search">
              <Search size={16} aria-hidden className="search-ic" />
              <span className="sr-only">Tablarda ve derslerde ara</span>
              <input type="search" placeholder="Şarkı, sanatçı veya ders ara" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          )}
          {error ? (
            <EmptyState compact tone="danger" icon={<CloudOff size={22} />} title="Tablar yüklenemedi" description={error} action={<Button onClick={load}>Tekrar dene</Button>} />
          ) : tabs === null ? (
            <div className="lib-loading" role="status"><Spinner label="Tablar yükleniyor" /> Tablar yükleniyor…</div>
          ) : (
            <>
              <ul className="lib-grid" aria-label="Tablar">
                {visibleTabs.map((t) => {
                  const best = bestSpeed(progress[t.id]);
                  const played = relativeTime(recent[t.id]);
                  return (
                    <li key={t.id} className="tab-card-wrap">
                      <button type="button" className="tab-card" onClick={() => navigate(playTab(t.id))}>
                        <span className="tab-card-ic" aria-hidden><FileMusic size={18} /></span>
                        <span className="tab-card-title">{t.title || t.fileName}</span>
                        <span className="tab-card-sub">{t.artist || 'Bilinmeyen sanatçı'}</span>
                        <span className="tab-card-meta">{played ? `Son çalma ${played}` : 'Henüz çalınmadı'}</span>
                        <span className="tab-card-progress" aria-label={best == null ? 'Henüz pratik yapılmadı' : `En iyi temiz hız yüzde ${Math.round(best * 100)}`}>
                          <span className="bar"><span style={{ width: `${(best ?? 0) * 100}%` }} /></span>
                          <span className="num">{best == null ? '—' : `%${Math.round(best * 100)}`}</span>
                        </span>
                        <span className="tab-card-play" aria-hidden><Play size={16} fill="currentColor" /></span>
                      </button>
                      <IconButton className="tab-card-del" label={`“${t.title}” tabını sil`} icon={<Trash size={16} />} size="sm" onClick={() => setConfirm(t)} />
                    </li>
                  );
                })}
              </ul>
              {q && visibleTabs.length === 0 && <p className="subtle small">“{query}” ile eşleşen tab yok.</p>}
              {importer}
            </>
          )}
        </section>
      )}

      <section className="lib-sec" aria-labelledby="sec-lessons">
        <div className="sec-head">
          <h2 id="sec-lessons">Dersler</h2>
        </div>
        {lessons === null ? (
          <div className="lib-loading" role="status"><Spinner label="Dersler yükleniyor" /> Dersler yükleniyor…</div>
        ) : visibleLessons.length === 0 ? (
          <p className="subtle small">{q ? `“${query}” ile eşleşen ders yok.` : 'Şu an ders yok.'}</p>
        ) : (
          groupByLevel(visibleLessons).map((g) => (
            <div key={g.level} className="lesson-group">
              <h3 className="eyebrow">{LEVEL_LABEL[g.level]}</h3>
              <ul className="lib-grid" aria-label={`${LEVEL_LABEL[g.level]} dersleri`}>
                {g.items.map((l) => {
                  const played = relativeTime(recent[`lesson:${l.id}`]);
                  return (
                    <li key={l.id}>
                      <button type="button" className="tab-card lesson-card" onClick={() => navigate(playLesson(l.id))}>
                        <span className="tab-card-ic" aria-hidden><GraduationCap size={18} /></span>
                        <span className="tab-card-title">{l.title}</span>
                        <span className="tab-card-sub">{[LEVEL_LABEL[l.level], l.tempo ? `${l.tempo} BPM` : ''].filter(Boolean).join(' · ')}</span>
                        {l.description && <span className="tab-card-desc">{l.description}</span>}
                        <span className="tab-card-meta">{played ? `Son çalma ${played}` : 'Yeni'}</span>
                        <span className="tab-card-play" aria-hidden><Play size={16} fill="currentColor" /></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      {firstRun && !error && (
        <section className="lib-sec" aria-labelledby="sec-import">
          <div className="sec-head">
            <h2 id="sec-import">Kendi tablarını ekle</h2>
          </div>
          {importer}
        </section>
      )}

      <Dialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Tab silinsin mi?"
        description={confirm ? `“${confirm.title}” ve pratik geçmişi kalıcı olarak silinir. Bu işlem geri alınamaz.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Vazgeç</Button>
            <Button variant="danger" icon={<Trash size={15} />} onClick={() => confirm && remove(confirm)}>Sil</Button>
          </>
        }
      />
    </div>
  );
}

function WelcomeStep({ n, icon, title, text, action }: { n: number; icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <li className="welcome-step">
      <div className="welcome-ic" aria-hidden>{icon}</div>
      <div className="welcome-text">
        <p className="welcome-title"><span className="subtle num">{n}.</span> {title}</p>
        <p className="muted small">{text}</p>
      </div>
      {action && <div className="welcome-action">{action}</div>}
    </li>
  );
}
