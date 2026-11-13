import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { GuitarFinish, GuitarProfile } from '@guitar3d/shared';
import { Button, Spinner } from '../ui/kit';
import { StageGuitar } from '../screens/player/StageGuitar';
import { guitarsApi, loadTemplateProfile, type GuitarTemplate } from './api';
import { setActiveGuitar } from './activeGuitar';
import { customizeProfile, proportionalScale, sizeProblem } from './lib/customize';
import { Field, FinishEditor, MakeActiveToggle, NumberInput, SizePresets } from './controls';

export interface TemplateCustomizerProps {
  templates: GuitarTemplate[];
  initialTemplateId?: string;
  onSaved: (p: GuitarProfile) => void;
  onCancel: () => void;
  api?: typeof guitarsApi;
}

const NO_NOTES: never[] = [];

/** "Start from a template": pick a body, set name, size and colours with a live 3D preview. */
export function TemplateCustomizer({ templates, initialTemplateId, onSaved, onCancel, api = guitarsApi }: TemplateCustomizerProps) {
  const [tplId, setTplId] = useState(initialTemplateId ?? templates[0]?.id);
  const [base, setBase] = useState<GuitarProfile | null>(null);
  const [name, setName] = useState('');
  const [total, setTotal] = useState(106.7);
  const [scale, setScale] = useState(64.8);
  const [scaleAuto, setScaleAuto] = useState(true);
  const [finish, setFinish] = useState<GuitarFinish | null>(null);
  const [makeActive, setMakeActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = templates.find((x) => x.id === tplId);
    if (!t) return;
    let alive = true;
    setBase(null);
    setError(null);
    loadTemplateProfile(t)
      .then((p) => {
        if (!alive) return;
        setBase(p);
        setName((n) => (n && !templates.some((x) => n === `Benim ${x.name}`) ? n : `Benim ${t.name}`));
        setTotal(p.totalLengthCm);
        setScale(p.scaleLengthCm);
        setScaleAuto(true);
        setFinish(p.finish);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [tplId, templates]);

  const problem = sizeProblem(total, scale);
  const nameProblem = name.trim() ? null : 'Gitarına bir ad ver.';
  const profile = useMemo(
    () => (base && finish && !problem ? ({ ...customizeProfile(base, { name, totalLengthCm: total, scaleLengthCm: scale, finish }), id: 'preview' } as GuitarProfile) : null),
    [base, finish, name, total, scale, problem],
  );
  const preview = useDeferredValue(profile);

  const onTotal = (cm: number) => {
    setTotal(cm);
    if (scaleAuto && base && Number.isFinite(cm)) setScale(proportionalScale(base, cm));
  };

  const save = async () => {
    if (!profile || nameProblem) return;
    setBusy(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _preview, ...data } = profile;
      const saved = await api.create(data);
      if (makeActive) await setActiveGuitar(saved.id, saved);
      onSaved(saved);
    } catch (e) {
      setError(`Kaydedilemedi: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gs-root">
      <div className="gs-preview" aria-label="Canlı önizleme">
        {preview ? (
          <StageGuitar profile={preview} className="gs-preview-canvas" notes={NO_NOTES} beatId={0} beatProgress={0} view="player" cameraMode="overview" />
        ) : (
          <div className="gs-preview-empty">{problem ?? <Spinner label="Şablon yükleniyor" />}</div>
        )}
      </div>

      <div className="gs-form">
        <Field label="Şablon">
          {(id) => (
            <select id={id} className="gs-input" value={tplId} onChange={(e) => setTplId(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.kind ? ` · ${t.kind}` : ''}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Ad" error={nameProblem}>
          {(id) => <input id={id} className="gs-input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Toplam boy" hint="Kafanın ucundan gövdenin altına kadar. Hazır boylardan seç ya da cm gir." error={problem && !problem.startsWith('Tel') ? problem : null}>
          {(id) => (
            <div className="gs-row">
              <SizePresets totalCm={total} onTotal={onTotal} />
              <NumberInput id={id} value={Number.isFinite(total) ? total : ''} onChange={onTotal} unit="cm" min={80} max={125} />
            </div>
          )}
        </Field>
        <Field
          label="Tel boyu (scale)"
          hint={scaleAuto ? 'Boyla orantılı ayarlanıyor. Biliyorsan nut ile köprü arasını gir.' : 'Elle girildi.'}
          error={problem?.startsWith('Tel') ? problem : null}
        >
          {(id) => (
            <div className="gs-row">
              <NumberInput id={id} value={Number.isFinite(scale) ? scale : ''} onChange={(v) => { setScale(v); setScaleAuto(false); }} unit="cm" min={45} max={72} />
              {!scaleAuto && base && (
                <button type="button" className="gs-link" onClick={() => { setScaleAuto(true); setScale(proportionalScale(base, total)); }}>Orantılıya dön</button>
              )}
            </div>
          )}
        </Field>
        {finish && (
          <section className="gs-section">
            <h3 className="gs-h">Renkler</h3>
            <FinishEditor finish={finish} onChange={setFinish} />
          </section>
        )}
        <MakeActiveToggle checked={makeActive} onChange={setMakeActive} />
        {error && <p className="gs-error" role="alert">{error}</p>}
        <div className="gs-footer">
          <Button variant="ghost" onClick={onCancel}>Vazgeç</Button>
          <Button variant="primary" onClick={save} disabled={!profile || !!nameProblem || busy}>{busy ? 'Kaydediliyor…' : 'Gitarı kaydet'}</Button>
        </div>
      </div>
    </div>
  );
}
