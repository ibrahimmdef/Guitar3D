import { useCallback, useEffect, useState } from 'react';
import { Camera, Check, Copy, LayoutTemplate, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import type { GuitarProfile, GuitarSummary } from '@guitar3d/shared';
import { BUILTIN_GUITAR_ID } from '@guitar3d/shared';
import { Button, Dialog, IconButton, Sheet, Spinner, useToast } from '../../ui/kit';
import { ScreenHeader } from '../AppShell';
import { StageGuitar } from '../player/StageGuitar';
import { BUILTIN_TEMPLATE, guitarsApi, loadTemplates, type GuitarTemplate } from '../../guitar-setup/api';
import { useActiveGuitar } from '../../guitar-setup/activeGuitar';
import { GuitarSetupWizard } from '../../guitar-setup/GuitarSetupWizard';
import { TemplateCustomizer } from '../../guitar-setup/TemplateCustomizer';
import '../../styles/guitar.css';

type AddMode = { kind: 'choose' } | { kind: 'template'; templateId?: string } | { kind: 'photo' } | { kind: 'quick' };

const cm = (v?: number) => (v == null ? '—' : `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} cm`);
const inch = (v?: number) => (v == null ? '' : ` · ${Math.round(v / 2.54)}″`);
const NO_NOTES: never[] = [];

export function GuitarScreen() {
  const toast = useToast();
  const active = useActiveGuitar();
  const [guitars, setGuitars] = useState<GuitarSummary[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [templates, setTemplates] = useState<GuitarTemplate[]>([BUILTIN_TEMPLATE]);
  const [add, setAdd] = useState<AddMode | null>(null);
  const [renaming, setRenaming] = useState<GuitarSummary | null>(null);
  const [deleting, setDeleting] = useState<GuitarSummary | null>(null);

  const load = useCallback(() => {
    guitarsApi
      .list()
      .then((g) => {
        setGuitars(g);
        setOffline(false);
      })
      .catch(() => {
        setGuitars([{ id: BUILTIN_GUITAR_ID, name: 'Veston (built-in)', builtIn: true }]);
        setOffline(true);
      });
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    loadTemplates().then(setTemplates);
  }, []);

  const fail = (title: string) => (e: unknown) => toast({ title, description: (e as Error).message, tone: 'danger' });

  const use = (g: GuitarSummary) =>
    active.setActive(g.id).then(() => toast({ title: `Now using ${g.name}`, tone: 'success', durationMs: 2500 }), fail('Couldn\'t select the guitar'));

  const duplicate = async (g: GuitarSummary) => {
    try {
      const copy = g.builtIn
        ? await guitarsApi.loadProfile(g.id).then(({ id: _id, builtIn: _b, ...p }) => guitarsApi.create({ ...p, name: 'Veston (copy)' }))
        : await guitarsApi.duplicate(g.id);
      toast({ title: `${copy.name} created`, tone: 'success', durationMs: 2500 });
      load();
    } catch (e) {
      fail('Couldn\'t copy')(e);
    }
  };

  const onSaved = (p: GuitarProfile) => {
    setAdd(null);
    toast({ title: `${p.name} saved`, tone: 'success' });
    load();
  };

  const own = guitars?.filter((g) => !g.builtIn) ?? [];
  const builtIn = guitars?.filter((g) => g.builtIn) ?? [];

  return (
    <div className="screen">
      <ScreenHeader
        title="My guitars"
        description="Choose which guitar appears on stage, or add your own."
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdd({ kind: 'choose' })}>Add guitar</Button>}
      />

      <section className="gg-hero" aria-label="Current guitar">
        <div className="gg-hero-stage">
          <StageGuitar className="gg-hero-canvas" notes={NO_NOTES} beatId={0} beatProgress={0} view="player" cameraMode="overview" />
          {active.loading && <span className="gg-hero-loading"><Spinner label="Loading guitar" /></span>}
        </div>
        <div className="gg-hero-info">
          <span className="gg-eyebrow">In use</span>
          <h2 className="gg-hero-name">{active.profile?.name ?? '…'}</h2>
          {active.profile && (
            <p className="muted small num">
              {cm(active.profile.totalLengthCm)}{inch(active.profile.totalLengthCm)} · scale {cm(active.profile.scaleLengthCm)} · {active.profile.fretCount} frets
            </p>
          )}
          {active.error && <p className="gs-error">{active.error}</p>}
        </div>
      </section>

      {!guitars ? (
        <div className="lib-loading" role="status"><Spinner label="Loading guitars" /> Loading guitars…</div>
      ) : (
        <>
          <h2 className="gg-h">My guitars</h2>
          <ul className="gg-grid" aria-label="My guitars">
            {[...builtIn, ...own].map((g) => (
              <GuitarCard
                key={g.id}
                g={g}
                active={active.id === g.id}
                onUse={() => use(g)}
                onRename={g.builtIn ? undefined : () => setRenaming(g)}
                onDuplicate={offline ? undefined : () => duplicate(g)}
                onDelete={g.builtIn ? undefined : () => setDeleting(g)}
              />
            ))}
            <li>
              <button type="button" className="gg-card gg-add" onClick={() => setAdd({ kind: 'choose' })}>
                <span className="gg-thumb" aria-hidden><Plus size={22} /></span>
                <span className="gg-info">
                  <span className="gg-name">Add guitar</span>
                  <span className="muted small">From a template or photos.</span>
                </span>
              </button>
            </li>
          </ul>
          {offline && <p className="lib-note subtle small">Couldn't open this browser's storage (private mode?); only the built-in Veston is shown.</p>}

          <h2 className="gg-h">Templates</h2>
          <ul className="gg-grid" aria-label="Templates">
            {templates.map((t) => (
              <li key={t.id} className="gg-card">
                <span className="gg-thumb" aria-hidden><LayoutTemplate size={22} /></span>
                <div className="gg-info">
                  <span className="gg-name">{t.name}{t.kind && <span className="badge badge-quiet">{t.kind}</span>}</span>
                  {t.description && <span className="muted small">{t.description}</span>}
                </div>
                <Button size="sm" onClick={() => setAdd({ kind: 'template', templateId: t.id })} disabled={offline}>Customize</Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet
        open={!!add}
        onOpenChange={(o) => !o && setAdd(null)}
        size="lg"
        title={add?.kind === 'template' ? 'Guitar from template' : add?.kind === 'photo' ? 'Guitar from photos' : add?.kind === 'quick' ? 'Quick guitar' : 'Add guitar'}
        description={
          add?.kind === 'template'
            ? 'Pick a body, then set its name, size and colors.'
            : add?.kind === 'photo'
              ? 'Step by step: photos, a few clicks and a measurement.'
              : add?.kind === 'quick'
                ? 'A single front photo and the size are enough.'
                : 'How do you want to start?'
        }
      >
        {add?.kind === 'choose' && <AddChooser offline={offline} onPick={setAdd} />}
        {add?.kind === 'template' && <TemplateCustomizer templates={templates} initialTemplateId={add.templateId} onSaved={onSaved} onCancel={() => setAdd({ kind: 'choose' })} />}
        {add?.kind === 'photo' && <GuitarSetupWizard mode="photo" onSaved={onSaved} onCancel={() => setAdd({ kind: 'choose' })} />}
        {add?.kind === 'quick' && <GuitarSetupWizard mode="quick" onSaved={onSaved} onCancel={() => setAdd({ kind: 'choose' })} />}
      </Sheet>

      <RenameDialog
        guitar={renaming}
        onClose={() => setRenaming(null)}
        onDone={(g) => {
          setRenaming(null);
          active.invalidate(g.id);
          load();
        }}
      />

      <Dialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this guitar?"
        description={deleting ? `“${deleting.name}” and its photos will be permanently deleted.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                const g = deleting!;
                setDeleting(null);
                try {
                  await guitarsApi.remove(g.id);
                  active.invalidate(g.id, true);
                  toast({ title: `${g.name} deleted`, durationMs: 2500 });
                  load();
                } catch (e) {
                  fail('Couldn\'t delete')(e);
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}

function GuitarCard({ g, active, onUse, onRename, onDuplicate, onDelete }: {
  g: GuitarSummary;
  active: boolean;
  onUse: () => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}) {
  return (
    <li className={`gg-card${active ? ' is-active' : ''}`}>
      <span className="gg-thumb" aria-hidden>
        {g.thumbnail ? <img src={g.thumbnail} alt="" /> : g.builtIn ? <img src="/guitar/headstock.jpg" alt="" /> : <Camera size={22} />}
      </span>
      <div className="gg-info">
        <span className="gg-name">
          {g.name}
          {g.builtIn && <span className="badge badge-quiet">Built-in</span>}
        </span>
        <span className="muted small num">{g.totalLengthCm ? `${cm(g.totalLengthCm)}${inch(g.totalLengthCm)} · scale ${cm(g.scaleLengthCm)}` : '42″ dreadnought'}</span>
        <span className="gg-actions">
          {onRename && <IconButton size="sm" label="Rename" icon={<Pencil size={14} />} onClick={onRename} />}
          {onDuplicate && <IconButton size="sm" label="Duplicate" icon={<Copy size={14} />} onClick={onDuplicate} />}
          {onDelete && <IconButton size="sm" label="Delete" icon={<Trash2 size={14} />} onClick={onDelete} />}
        </span>
      </div>
      {active ? (
        <span className="gg-active"><Check size={14} /> In use</span>
      ) : (
        <Button size="sm" onClick={onUse}>Use</Button>
      )}
    </li>
  );
}

function AddChooser({ onPick, offline }: { onPick: (m: AddMode) => void; offline: boolean }) {
  const paths = [
    { mode: { kind: 'template' } as AddMode, icon: <LayoutTemplate size={20} />, title: 'From a template', text: 'Pick a ready-made body and match its size and colors to your guitar. The fastest way.', time: '1 min' },
    { mode: { kind: 'photo' } as AddMode, icon: <Camera size={20} />, title: 'From photos, step by step', text: 'A front photo, a few clicks, and optionally fretboard and headstock photos. The most realistic result.', time: '5–10 min' },
    { mode: { kind: 'quick' } as AddMode, icon: <Zap size={20} />, title: 'Quick mode', text: 'One front photo and the size. Shape and color are guessed from the photo.', time: '2 min' },
  ];
  return (
    <div className="gg-paths">
      {paths.map((p) => (
        <button key={p.title} type="button" className="gg-path" disabled={offline} onClick={() => onPick(p.mode)}>
          <span className="gg-path-icon" aria-hidden>{p.icon}</span>
          <span className="gg-path-body">
            <span className="gg-path-title">{p.title}<span className="gg-path-time num">{p.time}</span></span>
            <span className="muted small">{p.text}</span>
          </span>
        </button>
      ))}
      {offline && <p className="gs-error">This browser doesn't allow saving data (private mode?), so guitars can't be saved.</p>}
    </div>
  );
}

function RenameDialog({ guitar, onClose, onDone }: { guitar: GuitarSummary | null; onClose: () => void; onDone: (g: GuitarProfile) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(guitar?.name ?? '');
    setError(null);
  }, [guitar]);
  const submit = async () => {
    const n = name.trim();
    if (!n) return setError('Name can\'t be empty.');
    if (n.length > 120) return setError('Name can be at most 120 characters.');
    setBusy(true);
    try {
      onDone(await guitarsApi.rename(guitar!.id, n));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={!!guitar}
      onOpenChange={(o) => !o && onClose()}
      title="Rename"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>Save</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className="gs-label" htmlFor="gg-rename">Name</label>
        <input id="gg-rename" className="gs-input" value={name} maxLength={120} autoFocus onChange={(e) => setName(e.target.value)} />
        {error && <p className="gs-field-error" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
