import { GUITAR_SOUNDS } from '../../audio/sounds';
import { Card, SegmentedControl, Slider, Toggle } from '../../ui/kit';
import { DEFAULT_SETTINGS, useSettings, type Settings } from '../../ui/settings';
import { ShortcutList } from '../../ui/ShortcutList';
import { ScreenHeader } from '../AppShell';
import { SPEED_PRESETS } from '../player/Transport';
import { BackupSection } from './BackupSection';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function SettingsScreen() {
  const [s, set] = useSettings();
  const preset = SPEED_PRESETS.find((v) => Math.abs(v - s.defaultSpeed) < 0.001);

  return (
    <div className="screen screen-narrow">
      <ScreenHeader title="Settings" description="Stored on this device. Backup is at the bottom." />

      <section className="settings-sec" aria-labelledby="set-play">
        <h2 id="set-play" className="eyebrow">Playback</h2>
        <Card className="settings-card">
          <div className="setting">
            <div className="setting-text">
              <div className="setting-label">Default speed</div>
              <p className="setting-desc">Every tab opens at this speed.</p>
            </div>
            <SegmentedControl
              aria-label="Default speed"
              size="sm"
              value={preset ? String(preset) : ''}
              onChange={(v) => set({ defaultSpeed: Number(v) })}
              options={SPEED_PRESETS.map((v) => ({ value: String(v), label: pct(v) }))}
            />
          </div>
          <Slider label="Custom speed" min={0.25} max={1.5} step={0.05} value={s.defaultSpeed} onChange={(v) => set({ defaultSpeed: v })} format={pct} />
          <hr />
          <Toggle label="Count-in" description="The metronome counts one bar before playback starts." checked={s.countIn} onChange={(v) => set({ countIn: v })} />
          <hr />
          <Toggle label="Start with metronome on" checked={s.metronome} onChange={(v) => set({ metronome: v })} />
          <Slider label="Metronome volume" min={0} max={1} step={0.05} value={s.metronomeVolume} onChange={(v) => set({ metronomeVolume: v })} format={pct} />
          <hr />
          <div className="setting setting-col">
            <div className="setting-text">
              <div className="setting-label" id="set-sound">Guitar sound</div>
              <p className="setting-desc">Tabs are played with this instrument.</p>
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
        <h2 id="set-look" className="eyebrow">Appearance</h2>
        <Card className="settings-card">
          <div className="setting">
            <div className="setting-text">
              <div className="setting-label">Theme</div>
              <p className="setting-desc">The 3D stage stays dark in every theme.</p>
            </div>
            <SegmentedControl<Settings['theme']>
              aria-label="Theme"
              size="sm"
              value={s.theme}
              onChange={(v) => set({ theme: v })}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'System' },
              ]}
            />
          </div>
          <hr />
          <div className="setting">
            <div className="setting-text">
              <div className="setting-label">Guitar view</div>
              <p className="setting-desc">Player: same direction as the tab. Audience: from the front.</p>
            </div>
            <SegmentedControl
              aria-label="Guitar view"
              size="sm"
              value={s.view}
              onChange={(v) => set({ view: v })}
              options={[
                { value: 'player', label: 'Player' },
                { value: 'audience', label: 'Audience' },
              ]}
            />
          </div>
          <hr />
          <Toggle label="Show tab strip" checked={s.showTabStrip} onChange={(v) => set({ showTabStrip: v })} />
          <hr />
          <Toggle label="Fret numbers" description="Shows fret numbers along the edge of the neck." checked={s.showFretNumbers} onChange={(v) => set({ showFretNumbers: v })} />
        </Card>
        <button type="button" className="link-btn" onClick={() => set(DEFAULT_SETTINGS)}>Reset to defaults</button>
      </section>

      <section className="settings-sec" aria-labelledby="set-a11y">
        <h2 id="set-a11y" className="eyebrow">Accessibility</h2>
        <Card className="settings-card">
          <Toggle label="High contrast" description="Text and lines stand out more." checked={s.highContrast} onChange={(v) => set({ highContrast: v })} />
          <hr />
          <Toggle label="Color-blind friendly colors" description="Blue and orange instead of red and green for right/wrong." checked={s.colorBlind} onChange={(v) => set({ colorBlind: v })} />
          <hr />
          <Toggle label="Large markers" description="Enlarges the note strip, chord diagrams, rhythm arrows and the tab grid." checked={s.largeMarkers} onChange={(v) => set({ largeMarkers: v })} />
          <hr />
          <div className="setting">
            <div className="setting-text">
              <div className="setting-label">Motion</div>
              <p className="setting-desc">When reduced, transition animations are turned off.</p>
            </div>
            <SegmentedControl<Settings['motion']>
              aria-label="Motion"
              size="sm"
              value={s.motion}
              onChange={(v) => set({ motion: v })}
              options={[
                { value: 'system', label: 'System' },
                { value: 'reduce', label: 'Reduce' },
              ]}
            />
          </div>
        </Card>
      </section>

      <section className="settings-sec" aria-labelledby="set-keys">
        <h2 id="set-keys" className="eyebrow">Keyboard shortcuts</h2>
        <Card className="settings-card">
          <ShortcutList />
        </Card>
      </section>
      <BackupSection />
    </div>
  );
}
