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

const cm = (v?: number) => (v == null ? '—' : `${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} cm`);
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
        setGuitars([{ id: BUILTIN_GUITAR_ID, name: 'Veston (yerleşik)', builtIn: true }]);
        setOffline(true);
      });
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    loadTemplates().then(setTemplates);
  }, []);

  const fail = (title: string) => (e: unknown) => toast({ title, description: (e as Error).message, tone: 'danger' });

  const use = (g: GuitarSummary) =>
    active.setActive(g.id).then(() => toast({ title: `${g.name} kullanılıyor`, tone: 'success', durationMs: 2500 }), fail('Gitar seçilemedi'));

  const duplicate = async (g: GuitarSummary) => {
    try {
      const copy = g.builtIn
        ? await guitarsApi.loadProfile(g.id).then(({ id: _id, builtIn: _b, ...p }) => guitarsApi.create({ ...p, name: 'Veston (kopya)' }))
        : await guitarsApi.duplicate(g.id);
      toast({ title: `${copy.name} oluşturuldu`, tone: 'success', durationMs: 2500 });
      load();
    } catch (e) {
      fail('Kopyalanamadı')(e);
    }
  };

  const onSaved = (p: GuitarProfile) => {
    setAdd(null);
    toast({ title: `${p.name} kaydedildi`, tone: 'success' });
    load();
  };

  const own = guitars?.filter((g) => !g.builtIn) ?? [];
  const builtIn = guitars?.filter((g) => g.builtIn) ?? [];

  return (
    <div className="screen">
      <ScreenHeader
        title="Gitarım"
        description="Sahnede hangi gitarın görüneceğini seç ya da kendi gitarını ekle."
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdd({ kind: 'choose' })}>Gitar ekle</Button>}
      />

      <section className="gg-hero" aria-label="Kullanılan gitar">
        <div className="gg-hero-stage">
          <StageGuitar className="gg-hero-canvas" notes={NO_NOTES} beatId={0} beatProgress={0} view="player" cameraMode="overview" />
          {active.loading && <span className="gg-hero-loading"><Spinner label="Gitar yükleniyor" /></span>}
        </div>
        <div className="gg-hero-info">
          <span className="gg-eyebrow">Kullanılıyor</span>
          <h2 className="gg-hero-name">{active.profile?.name ?? '…'}</h2>
          {active.profile && (
            <p className="muted small num">
              {cm(active.profile.totalLengthCm)}{inch(active.profile.totalLengthCm)} · tel boyu {cm(active.profile.scaleLengthCm)} · {active.profile.fretCount} perde
            </p>
          )}
          {active.error && <p className="gs-error">{active.error}</p>}
        </div>
      </section>

      {!guitars ? (
        <div className="lib-loading" role="status"><Spinner label="Gitarlar yükleniyor" /> Gitarlar yükleniyor…</div>
      ) : (
        <>
          <h2 className="gg-h">Gitarlarım</h2>
          <ul className="gg-grid" aria-label="Gitarlarım">
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
                  <span className="gg-name">Gitar ekle</span>
                  <span className="muted small">Şablondan ya da fotoğraflardan.</span>
                </span>
              </button>
            </li>
          </ul>
          {offline && <p className="lib-note subtle small">Sunucuya ulaşılamadı; yalnızca yerleşik Veston gösteriliyor. Seçimin bu tarayıcıda saklanır.</p>}

          <h2 className="gg-h">Şablonlar</h2>
          <ul className="gg-grid" aria-label="Şablonlar">
            {templates.map((t) => (
              <li key={t.id} className="gg-card">
                <span className="gg-thumb" aria-hidden><LayoutTemplate size={22} /></span>
                <div className="gg-info">
                  <span className="gg-name">{t.name}{t.kind && <span className="badge badge-quiet">{t.kind}</span>}</span>
                  {t.description && <span className="muted small">{t.description}</span>}
                </div>
                <Button size="sm" onClick={() => setAdd({ kind: 'template', templateId: t.id })} disabled={offline}>Özelleştir</Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet
        open={!!add}
        onOpenChange={(o) => !o && setAdd(null)}
        size="lg"
        title={add?.kind === 'template' ? 'Şablondan gitar' : add?.kind === 'photo' ? 'Fotoğraflardan gitar' : add?.kind === 'quick' ? 'Hızlı gitar' : 'Gitar ekle'}
        description={
          add?.kind === 'template'
            ? 'Bir gövde seç; adını, boyunu ve renklerini ayarla.'
            : add?.kind === 'photo'
              ? 'Adım adım: fotoğraflar, birkaç tıklama ve ölçü.'
              : add?.kind === 'quick'
                ? 'Tek bir ön fotoğraf ve boy yeterli.'
                : 'Nasıl başlamak istersin?'
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
        title="Gitar silinsin mi?"
        description={deleting ? `“${deleting.name}” ve fotoğrafları kalıcı olarak silinecek.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Vazgeç</Button>
            <Button
              variant="danger"
              onClick={async () => {
                const g = deleting!;
                setDeleting(null);
                try {
                  await guitarsApi.remove(g.id);
                  active.invalidate(g.id, true);
                  toast({ title: `${g.name} silindi`, durationMs: 2500 });
                  load();
                } catch (e) {
                  fail('Silinemedi')(e);
                }
              }}
            >
              Sil
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
          {g.builtIn && <span className="badge badge-quiet">Yerleşik</span>}
        </span>
        <span className="muted small num">{g.totalLengthCm ? `${cm(g.totalLengthCm)}${inch(g.totalLengthCm)} · tel ${cm(g.scaleLengthCm)}` : '42″ dreadnought'}</span>
        <span className="gg-actions">
          {onRename && <IconButton size="sm" label="Yeniden adlandır" icon={<Pencil size={14} />} onClick={onRename} />}
          {onDuplicate && <IconButton size="sm" label="Kopyasını oluştur" icon={<Copy size={14} />} onClick={onDuplicate} />}
          {onDelete && <IconButton size="sm" label="Sil" icon={<Trash2 size={14} />} onClick={onDelete} />}
        </span>
      </div>
      {active ? (
        <span className="gg-active"><Check size={14} /> Kullanılıyor</span>
      ) : (
        <Button size="sm" onClick={onUse}>Kullan</Button>
      )}
    </li>
  );
}

function AddChooser({ onPick, offline }: { onPick: (m: AddMode) => void; offline: boolean }) {
  const paths = [
    { mode: { kind: 'template' } as AddMode, icon: <LayoutTemplate size={20} />, title: 'Şablondan', text: 'Hazır bir gövdeyi seç, boyunu ve renklerini kendi gitarına benzet. En hızlı yol.', time: '1 dk' },
    { mode: { kind: 'photo' } as AddMode, icon: <Camera size={20} />, title: 'Fotoğraflarla, adım adım', text: 'Ön fotoğraf, birkaç tıklama, istersen klavye ve kafa fotoğrafı. En gerçekçi sonuç.', time: '5–10 dk' },
    { mode: { kind: 'quick' } as AddMode, icon: <Zap size={20} />, title: 'Hızlı mod', text: 'Tek ön fotoğraf ve boy. Şekil ve renk fotoğraftan tahmin edilir.', time: '2 dk' },
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
      {offline && <p className="gs-error">Gitar kaydetmek için sunucunun çalışıyor olması gerekiyor.</p>}
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
    if (!n) return setError('Ad boş olamaz.');
    if (n.length > 120) return setError('Ad en fazla 120 karakter olabilir.');
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
      title="Yeniden adlandır"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>Kaydet</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className="gs-label" htmlFor="gg-rename">Ad</label>
        <input id="gg-rename" className="gs-input" value={name} maxLength={120} autoFocus onChange={(e) => setName(e.target.value)} />
        {error && <p className="gs-field-error" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
