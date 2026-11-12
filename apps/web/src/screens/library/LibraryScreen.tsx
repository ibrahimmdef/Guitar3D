import { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudOff, FileMusic, Play, Search, Sparkles, Trash } from 'lucide-react';
import type { TabMeta, TabProgress } from '@guitar3d/shared';
import { Button, Dialog, EmptyState, IconButton, SegmentedControl, Spinner, useToast } from '../../ui/kit';
import { navigate } from '../../ui/router';
import { getRecent } from '../../ui/settings';
import { ScreenHeader } from '../AppShell';
import { bestSpeed, deleteTab, getProgress, listTabs } from '../data';
import { TabImportSlot } from './TabImportSlot';

type Sort = 'recent' | 'title' | 'added';

const rtf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' });
function relative(iso: string | undefined) {
  if (!iso) return null;
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'az önce';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const collator = new Intl.Collator('tr');

export function LibraryScreen() {
  const toast = useToast();
  const [tabs, setTabs] = useState<TabMeta[] | null>(null);
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
      .catch(() => setError('Sunucuya ulaşılamadı. Sunucunun çalıştığından emin ol ve tekrar dene.'));
  }, []);
  useEffect(load, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    const list = (tabs ?? []).filter((t) => !q || `${t.title} ${t.artist} ${t.fileName}`.toLocaleLowerCase('tr').includes(q));
    return [...list].sort((a, b) => {
      if (sort === 'title') return collator.compare(a.title, b.title);
      if (sort === 'added') return b.uploadedAt.localeCompare(a.uploadedAt);
      return (recent[b.id] ?? b.uploadedAt).localeCompare(recent[a.id] ?? a.uploadedAt);
    });
  }, [tabs, query, sort, recent]);

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

  return (
    <div className="screen">
      <ScreenHeader title="Kütüphane" description="Tablarını yükle, birine tıkla ve 3D gitarda çalışmaya başla." />

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

      <div className="lib-toolbar">
        <label className="search">
          <Search size={16} aria-hidden className="search-ic" />
          <span className="sr-only">Tablarda ara</span>
          <input type="search" placeholder="Şarkı, sanatçı veya dosya ara" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
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
      </div>

      {error ? (
        <EmptyState tone="danger" icon={<CloudOff size={22} />} title="Kütüphane yüklenemedi" description={error} action={<Button onClick={load}>Tekrar dene</Button>} />
      ) : tabs === null ? (
        <div className="lib-loading" role="status"><Spinner label="Kütüphane yükleniyor" /> Kütüphane yükleniyor…</div>
      ) : (
        <ul className="lib-grid" aria-label="Tablar">
          {!query && (
            <li>
              <button type="button" className="tab-card tab-card-demo" onClick={() => navigate({ name: 'player', tabId: null })}>
                <span className="tab-card-ic" aria-hidden><Sparkles size={18} /></span>
                <span className="tab-card-title">Isınma Etüdü</span>
                <span className="tab-card-sub">Demo · 84 BPM</span>
                <span className="tab-card-meta">Uygulamayı denemek için hazır bir tab</span>
                <span className="tab-card-play" aria-hidden><Play size={16} fill="currentColor" /></span>
              </button>
            </li>
          )}
          {visible.map((t) => {
            const best = bestSpeed(progress[t.id]);
            const played = relative(recent[t.id]);
            return (
              <li key={t.id} className="tab-card-wrap">
                <button type="button" className="tab-card" onClick={() => navigate({ name: 'player', tabId: t.id })}>
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
      )}

      {tabs && tabs.length === 0 && !error && (
        <p className="lib-note subtle small">Henüz tab yüklemedin. Yukarıdaki alana bir Guitar Pro dosyası bırak ya da demoyla başla.</p>
      )}
      {tabs && tabs.length > 0 && visible.length === 0 && (
        <EmptyState compact icon={<Search size={20} />} title="Sonuç yok" description={`“${query}” ile eşleşen tab bulunamadı.`} action={<Button variant="ghost" onClick={() => setQuery('')}>Aramayı temizle</Button>} />
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
