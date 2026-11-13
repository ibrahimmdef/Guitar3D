import { useEffect, useRef, useState } from 'react';
import { CloudDownload, CloudUpload, Download, Upload } from 'lucide-react';
import { listSnapshots, loadSnapshot, makeBundle, parseBundle, restoreBundle, saveSnapshot, type BackupBundle } from '../../ui/backup';
import { relativeTime } from '../../ui/format';
import { Button, Card, Dialog, useToast } from '../../ui/kit';

/** Settings section: export/import everything as one file, or keep snapshots on the server. */
export function BackupSection() {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [snaps, setSnaps] = useState<{ name: string; createdAt: string; size: number }[]>([]);
  const [pending, setPending] = useState<BackupBundle | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => listSnapshots().then(setSnaps).catch(() => setSnaps([]));
  useEffect(() => {
    void refresh();
  }, []);

  const run = async (fn: () => Promise<void>, fail: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast({ tone: 'danger', title: fail, description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const exportFile = () => run(async () => {
    const b = await makeBundle();
    const url = URL.createObjectURL(new Blob([JSON.stringify(b)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `guitar3d-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'Dışa aktarılamadı.');

  const restore = () => {
    const b = pending;
    setPending(null);
    if (!b) return;
    void run(async () => {
      await restoreBundle(b);
      toast({ tone: 'success', title: 'Yedek geri yüklendi.', description: 'Sayfa yenileniyor…' });
      setTimeout(() => location.reload(), 800);
    }, 'Geri yüklenemedi.');
  };

  return (
    <section className="settings-sec" aria-labelledby="set-backup">
      <h2 id="set-backup" className="eyebrow">Yedekleme ve taşıma</h2>
      <Card className="settings-card">
        <p className="setting-desc">
          Gitarlar, tablar, pratik geçmişi, notlar, ödevler ve bu cihazdaki ayarlar tek bir dosyada. Ses kayıtları dahil değil.
          Başka bir cihaza taşımak için dosyayı orada içe aktar. Hesap ve otomatik çok cihazlı eşitleme ileride gelecek.
        </p>
        <div className="ti-row">
          <Button icon={<Download size={15} />} onClick={exportFile} disabled={busy}>Dosyaya aktar</Button>
          <Button icon={<Upload size={15} />} onClick={() => file.current?.click()} disabled={busy}>Dosyadan geri yükle</Button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                setPending(parseBundle(await f.text()));
              } catch (err) {
                toast({ tone: 'danger', title: 'Yedek okunamadı.', description: (err as Error).message });
              }
            }}
          />
        </div>
        <hr />
        <div className="ti-row">
          <Button icon={<CloudUpload size={15} />} disabled={busy} onClick={() => run(async () => {
            await saveSnapshot();
            await refresh();
            toast({ tone: 'success', title: 'Sunucuya yedeklendi.' });
          }, 'Yedeklenemedi.')}>Sunucuya yedekle</Button>
          <span className="subtle small">Son 10 yedek sunucuda saklanır.</span>
        </div>
        {snaps.length > 0 && (
          <ul className="rec-list">
            {snaps.map((s) => (
              <li key={s.name}>
                <span className="rec-text">
                  <span>{relativeTime(s.createdAt) ?? s.createdAt}</span>
                  <span className="subtle small num">{(s.size / 1024 / 1024).toFixed(1)} MB</span>
                </span>
                <Button size="sm" variant="ghost" icon={<CloudDownload size={14} />} disabled={busy} onClick={() => run(async () => setPending(await loadSnapshot(s.name)), 'Yedek alınamadı.')}>
                  Geri yükle
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Dialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Yedek geri yüklensin mi?"
        description="Sunucudaki tüm tablar, gitarlar, geçmiş ve bu cihazdaki ayarlar yedektekilerle değiştirilir. Bu işlem geri alınamaz."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>Vazgeç</Button>
            <Button variant="danger" onClick={restore}>Geri yükle</Button>
          </>
        }
      />
    </section>
  );
}
