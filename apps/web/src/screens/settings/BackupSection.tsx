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
    a.download = `guitar3d-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'Couldn\'t export.');

  const restore = () => {
    const b = pending;
    setPending(null);
    if (!b) return;
    void run(async () => {
      await restoreBundle(b);
      toast({ tone: 'success', title: 'Backup restored.', description: 'Reloading the page…' });
      setTimeout(() => location.reload(), 800);
    }, 'Couldn\'t restore.');
  };

  return (
    <section className="settings-sec" aria-labelledby="set-backup">
      <h2 id="set-backup" className="eyebrow">Backup and transfer</h2>
      <Card className="settings-card">
        <p className="setting-desc">
          Guitars, tabs, practice history, notes, assignments and this device's settings in a single file. Audio recordings aren't included.
          To move to another device, import the file there. Accounts and automatic multi-device sync are coming later.
        </p>
        <div className="ti-row">
          <Button icon={<Download size={15} />} onClick={exportFile} disabled={busy}>Export to file</Button>
          <Button icon={<Upload size={15} />} onClick={() => file.current?.click()} disabled={busy}>Restore from file</Button>
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
                toast({ tone: 'danger', title: 'Couldn\'t read the backup.', description: (err as Error).message });
              }
            }}
          />
        </div>
        <hr />
        <div className="ti-row">
          <Button icon={<CloudUpload size={15} />} disabled={busy} onClick={() => run(async () => {
            await saveSnapshot();
            await refresh();
            toast({ tone: 'success', title: 'Backed up to the server.' });
          }, 'Couldn\'t back up.')}>Back up to server</Button>
          <span className="subtle small">The last 10 backups are kept on the server.</span>
        </div>
        {snaps.length > 0 && (
          <ul className="rec-list">
            {snaps.map((s) => (
              <li key={s.name}>
                <span className="rec-text">
                  <span>{relativeTime(s.createdAt) ?? s.createdAt}</span>
                  <span className="subtle small num">{(s.size / 1024 / 1024).toFixed(1)} MB</span>
                </span>
                <Button size="sm" variant="ghost" icon={<CloudDownload size={14} />} disabled={busy} onClick={() => run(async () => setPending(await loadSnapshot(s.name)), 'Couldn\'t load the backup.')}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Dialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Restore this backup?"
        description="All tabs, guitars and history on the server, plus this device's settings, will be replaced with the ones in the backup. This can't be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
            <Button variant="danger" onClick={restore}>Restore</Button>
          </>
        }
      />
    </section>
  );
}
