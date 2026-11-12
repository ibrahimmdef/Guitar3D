import { useCallback, useEffect, useState } from 'react';
import { Camera, Guitar, Plus } from 'lucide-react';
import { Button, Sheet, Spinner } from '../../ui/kit';
import { ScreenHeader } from '../AppShell';
import { listGuitars, type GuitarSummary } from '../data';
import { GuitarSetupSlot } from './GuitarSetupSlot';

const cm = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} cm`);
const inch = (v: number | null) => (v == null ? '' : ` (${Math.round(v / 2.54)}″)`);

export function GuitarScreen() {
  const [data, setData] = useState<{ guitars: GuitarSummary[]; activeId: string | null; fallback: boolean } | null>(null);
  const [wizard, setWizard] = useState(false);

  const load = useCallback(() => {
    listGuitars().then(setData);
  }, []);
  useEffect(load, [load]);

  return (
    <div className="screen">
      <ScreenHeader
        title="Gitarım"
        description="3D sahnede kendi gitarını gör. İki fotoğraf ve birkaç tıklamayla yeni bir gitar oluştur."
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setWizard(true)}>Gitar ekle</Button>}
      />

      {!data ? (
        <div className="lib-loading" role="status"><Spinner label="Gitarlar yükleniyor" /> Gitarlar yükleniyor…</div>
      ) : (
        <ul className="guitar-grid" aria-label="Gitarlar">
          {data.guitars.map((g) => {
            const active = (data.activeId ?? data.guitars[0]?.id) === g.id;
            return (
              <li key={g.id} className={`guitar-card${active ? ' is-active' : ''}`}>
                <div className="guitar-thumb" aria-hidden>
                  {g.thumbnail ? <img src={g.thumbnail} alt="" /> : <Guitar size={28} />}
                </div>
                <div className="guitar-info">
                  <div className="guitar-name">
                    {g.name}
                    {active && <span className="badge">Kullanılıyor</span>}
                    {g.builtIn && <span className="badge badge-quiet">Yerleşik</span>}
                  </div>
                  <dl className="guitar-specs">
                    <div><dt>Toplam boy</dt><dd className="num">{cm(g.totalLengthCm)}{inch(g.totalLengthCm)}</dd></div>
                    <div><dt>Tel boyu</dt><dd className="num">{cm(g.scaleLengthCm)}</dd></div>
                    <div><dt>Perde</dt><dd className="num">{g.fretCount ?? '—'}</dd></div>
                  </dl>
                </div>
              </li>
            );
          })}
          <li>
            <button type="button" className="guitar-card guitar-add" onClick={() => setWizard(true)}>
              <span className="guitar-thumb" aria-hidden><Camera size={24} /></span>
              <span className="guitar-info">
                <span className="guitar-name">Yeni gitar oluştur</span>
                <span className="muted small">Gövdenin ve sapın fotoğrafını yükle, birkaç noktayı işaretle.</span>
              </span>
            </button>
          </li>
        </ul>
      )}

      {data?.fallback && (
        <p className="lib-note subtle small">Sunucuda kayıtlı gitar listesi bulunamadı; yerleşik Veston modeli gösteriliyor.</p>
      )}

      <Sheet
        open={wizard}
        onOpenChange={setWizard}
        title="Gitarını oluştur"
        description="Fotoğraflardan gitarının ölçülerini ve dokularını çıkar."
        size="lg"
      >
        <GuitarSetupSlot
          onDone={() => {
            setWizard(false);
            load();
          }}
          onCancel={() => setWizard(false)}
        />
      </Sheet>
    </div>
  );
}
