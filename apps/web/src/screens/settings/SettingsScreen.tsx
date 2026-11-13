import { GUITAR_SOUNDS } from '../../audio/sounds';
import { Card, SegmentedControl, Slider, Toggle } from '../../ui/kit';
import { DEFAULT_SETTINGS, useSettings, type Settings } from '../../ui/settings';
import { ShortcutList } from '../../ui/ShortcutList';
import { ScreenHeader } from '../AppShell';
import { SPEED_PRESETS } from '../player/Transport';

const pct = (v: number) => `%${Math.round(v * 100)}`;

export function SettingsScreen() {
  const [s, set] = useSettings();
  const preset = SPEED_PRESETS.find((v) => Math.abs(v - s.defaultSpeed) < 0.001);

  return (
    <div className="screen screen-narrow">
      <ScreenHeader title="Ayarlar" description="Bu cihazda saklanır." />

      <section className="settings-sec" aria-labelledby="set-play">
        <h2 id="set-play" className="eyebrow">Çalma</h2>
        <Card className="settings-card">
          <div className="setting">
            <div className="setting-text">
              <div className="setting-label">Varsayılan hız</div>
              <p className="setting-desc">Her tab bu hızla açılır.</p>
            </div>
            <SegmentedControl
              aria-label="Varsayılan hız"
              size="sm"
              value={preset ? String(preset) : ''}
              onChange={(v) => set({ defaultSpeed: Number(v) })}
              options={SPEED_PRESETS.map((v) => ({ value: String(v), label: pct(v) }))}
            />
          </div>
          <Slider label="Özel hız" min={0.25} max={1.5} step={0.05} value={s.defaultSpeed} onChange={(v) => set({ defaultSpeed: v })} format={pct} />
          <hr />
          <Toggle label="Sayarak başla" description="Çalmadan önce bir ölçü boyunca metronom sayar." checked={s.countIn} onChange={(v) => set({ countIn: v })} />
          <hr />
          <Toggle label="Metronom açık başlasın" checked={s.metronome} onChange={(v) => set({ metronome: v })} />
          <Slider label="Metronom sesi" min={0} max={1} step={0.05} value={s.metronomeVolume} onChange={(v) => set({ metronomeVolume: v })} format={pct} />
          <hr />
          <div className="setting setting-col">
            <div className="setting-text">
              <div className="setting-label" id="set-sound">Gitar sesi</div>
              <p className="setting-desc">Tab bu enstrümanla çalınır.</p>
            </div>
            <div className="sound-list" role="radiogroup" aria-labelledby="set-sound">
              {GUITAR_SOUNDS.map((snd) => (
                <button
                  key={snd.program}
                  type="button"
                  role="radio"
                  aria-checked={s.program === snd.program}
                  className={`sound-opt${s.program === snd.program ? ' is-on' : ''}`}
                  onClick={() => set({ program: snd.program })}
                >
                  {snd.label}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <section className="settings-sec" aria-labelledby="set-look">
        <h2 id="set-look" className="eyebrow">Görünüm</h2>
        <Card className="settings-card">
          <div className="setting">
            <div className="setting-text">
              <div className="setting-label">Tema</div>
              <p className="setting-desc">3D sahne her temada koyu kalır.</p>
            </div>
            <SegmentedControl<Settings['theme']>
              aria-label="Tema"
              size="sm"
              value={s.theme}
              onChange={(v) => set({ theme: v })}
              options={[
                { value: 'dark', label: 'Koyu' },
                { value: 'light', label: 'Açık' },
                { value: 'system', label: 'Sistem' },
              ]}
            />
          </div>
          <hr />
          <div className="setting">
            <div className="setting-text">
              <div className="setting-label">Gitar yönü</div>
              <p className="setting-desc">Oyuncu: tab ile aynı yönde. Seyirci: karşıdan.</p>
            </div>
            <SegmentedControl
              aria-label="Gitar yönü"
              size="sm"
              value={s.view}
              onChange={(v) => set({ view: v })}
              options={[
                { value: 'player', label: 'Oyuncu' },
                { value: 'audience', label: 'Seyirci' },
              ]}
            />
          </div>
          <hr />
          <Toggle label="Tab şeridini göster" checked={s.showTabStrip} onChange={(v) => set({ showTabStrip: v })} />
          <hr />
          <Toggle label="Perde numaraları" description="Sapın kenarında perde numaralarını gösterir." checked={s.showFretNumbers} onChange={(v) => set({ showFretNumbers: v })} />
        </Card>
        <button type="button" className="link-btn" onClick={() => set(DEFAULT_SETTINGS)}>Varsayılanlara dön</button>
      </section>

      <section className="settings-sec" aria-labelledby="set-keys">
        <h2 id="set-keys" className="eyebrow">Klavye kısayolları</h2>
        <Card className="settings-card">
          <ShortcutList />
        </Card>
      </section>
    </div>
  );
}
