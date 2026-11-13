import { TrendingUp } from 'lucide-react';
import type { LadderState } from '../player/tempoLadder';
import { Slider, Toggle } from './kit';
import { useSettings } from './settings';

const pct = (v: number) => `%${Math.round(v * 100)}`;

interface Props {
  auto: boolean;
  onAuto: (on: boolean) => void;
  /** Restart the ladder with new settings. */
  onRestart: (cfg: { start: number; target: number; passes: number }) => void;
  ladder: LadderState;
  listening: boolean;
  hasLoop: boolean;
}

/** Practice drawer: automatic tempo ladder switch, its settings and where the climb stands. */
export function LadderPanel({ auto, onAuto, onRestart, ladder, listening, hasLoop }: Props) {
  const [s, set] = useSettings();
  const span = Math.max(0.0001, ladder.target - s.ladderStart);
  const cfg = { start: s.ladderStart, target: s.ladderTarget, passes: s.ladderPasses };
  const progress = Math.min(1, Math.max(0, (ladder.speed - s.ladderStart) / span));
  return (
    <section className="ladder-panel" aria-labelledby="ladder-title">
      <Toggle
        label={<span id="ladder-title" className="ladder-title"><TrendingUp size={15} aria-hidden /> Otomatik tempo merdiveni</span>}
        description={`${pct(s.ladderStart)} ile başlar, ${s.ladderPasses} temiz turda %5 hızlanır, takılınca %5 yavaşlar.`}
        checked={auto}
        onChange={onAuto}
      />
      {auto && (
        <>
          <div className="ladder-status" aria-live="polite">
            <div className="ladder-status-row num">
              <span className="ladder-now">{pct(ladder.speed)}</span>
              <span className="subtle small">hedef {pct(ladder.target)}</span>
            </div>
            <div className="ladder-track" role="progressbar" aria-label="Hedef hıza ilerleme" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <span style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="subtle small">
              {ladder.clean}/{ladder.passes} temiz tur ·{' '}
              {listening ? `dinleme modunda doğruluğu %${s.ladderCleanAccuracy} ve üstü olan tur temiz sayılır` : 'her turdan sonra “Temiz çaldım” ya da “Takıldım” de'}
              {!hasLoop && ' · önce bir bölümü döngüye al'}
            </p>
          </div>
          <Slider label="Başlangıç" min={0.3} max={1} step={0.05} value={s.ladderStart} onChange={(v) => set({ ladderStart: v })} onCommit={(v) => onRestart({ ...cfg, start: v })} format={pct} />
          <Slider label="Hedef" min={0.5} max={1.5} step={0.05} value={s.ladderTarget} onChange={(v) => set({ ladderTarget: v })} onCommit={(v) => onRestart({ ...cfg, target: v })} format={pct} />
          <Slider label="Adım başına temiz tur" min={1} max={5} step={1} value={s.ladderPasses} onChange={(v) => set({ ladderPasses: v })} onCommit={(v) => onRestart({ ...cfg, passes: v })} />
          <Slider label="Temiz sayılan doğruluk" min={60} max={100} step={5} value={s.ladderCleanAccuracy} onChange={(v) => set({ ladderCleanAccuracy: v })} format={(v) => `%${v}`} />
          <p className="subtle small">Başlangıç, hedef ya da tur sayısı değişince merdiven baştan başlar.</p>
        </>
      )}
    </section>
  );
}
