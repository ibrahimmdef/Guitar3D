import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { makeBackup, parseBackup, restoreBackup, type BackupFile, type OldBackup } from '../../storage/backup';
import { Button, Card, Dialog, useToast } from '../../ui/kit';

/** Settings section: export everything to one file, or restore from one (also old server backups). */
export function BackupSection() {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | OldBackup | null>(null);
  const [busy, setBusy] = useState(false);

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
    const b = await makeBackup();
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
      await restoreBackup(b);
      toast({ tone: 'success', title: 'Backup restored.', description: 'Reloading the page…' });
      setTimeout(() => location.reload(), 800);
    }, 'Couldn\'t restore.');
  };

  return (
    <section className="settings-sec" aria-labelledby="set-backup">
      <h2 id="set-backup" className="eyebrow">Backup and transfer</h2>
      <Card className="settings-card">
        <p className="setting-desc">
          Everything is stored in this browser. Export your tabs, guitars, practice history, notes and settings to a single file to keep a copy or to
          move them to another browser or computer.
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
                setPending(parseBackup(await f.text()));
              } catch (err) {
                toast({ tone: 'danger', title: 'Couldn\'t read the backup.', description: (err as Error).message });
              }
            }}
          />
        </div>
      </Card>
      <Dialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Restore this backup?"
        description="All tabs, guitars, history and settings in this browser will be replaced with the ones in the backup. This can't be undone."
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
