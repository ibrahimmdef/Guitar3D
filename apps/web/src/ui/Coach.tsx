import { memo } from 'react';
import { Check, Lightbulb, RotateCcw } from 'lucide-react';
import type { Report } from '../tips/analyze';
import { Button } from './kit';

const KIND_LABEL: Record<string, string> = {
  shift: 'Pozisyon kayması', stretch: 'Açılım', barre: 'Barre', speed: 'Hız', hammer: 'Hammer-on',
  slide: 'Slide', bend: 'Bend', palmMute: 'Palm mute', chordChange: 'Akor geçişi',
};

export interface Ladder {
  speed: number;
  clean: number;
  target: number;
}

interface Props {
  report: Report | null;
  currentBar: number;
  loop: [number, number] | null;
  onBarClick: (bar: number, extend: boolean) => void;
  ladder: Ladder;
  onClean: () => void;
  onStuck: () => void;
}

const pct = (v: number) => `%${Math.round(v * 100)}`;

/** Practice drawer content: bar difficulty map, tips for the focused bar, tempo ladder, summary. */
export const Coach = memo(function Coach({ report, currentBar, loop, onBarClick, ladder, onClean, onStuck }: Props) {
  if (!report) {
    return <p className="muted small">Tab yüklenince ölçü haritası ve ipuçları burada görünecek.</p>;
  }
  const max = Math.max(1, ...report.bars.map((b) => b.difficulty));
  const focusBar = loop ? loop[0] : currentBar;
  const bar = report.bars[focusBar];
  const range = loop ? (loop[0] === loop[1] ? `Ölçü ${loop[0] + 1}` : `Ölçü ${loop[0] + 1}–${loop[1] + 1}`) : null;

  return (
    <div className="coach">
      <section className="coach-sec">
        <div className="coach-sec-head">
          <h3>Ölçü haritası</h3>
          <span className="heat-legend" aria-hidden>
            <span>Kolay</span><i /><span>Zor</span>
          </span>
        </div>
        <p className="coach-hint">Döngüye almak için ölçüye tıkla. Aralık için Shift ile tıkla.</p>
        <div className="heatmap" role="group" aria-label="Ölçüler, zorluğa göre">
          {report.bars.map((b) => {
            const inLoop = !!loop && b.bar >= loop[0] && b.bar <= loop[1];
            const level = b.difficulty / max;
            const label = `Ölçü ${b.bar + 1}${b.issues.length ? `: ${b.issues.map((i) => KIND_LABEL[i.kind]).join(', ')}` : ', kolay'}`;
            return (
              <button
                key={b.bar}
                type="button"
                className={`cell${b.bar === currentBar ? ' current' : ''}${inLoop ? ' looped' : ''}`}
                style={{ ['--h' as string]: level.toFixed(2) }}
                title={label}
                aria-label={label}
                aria-pressed={inLoop}
                onClick={(e) => onBarClick(b.bar, e.shiftKey)}
              >
                {b.bar + 1}
              </button>
            );
          })}
        </div>
      </section>

      <section className="coach-sec">
        <h3>{range ?? `Ölçü ${focusBar + 1}`}</h3>
        {bar && bar.issues.length ? (
          <ul className="tips">
            {bar.issues.map((i) => (
              <li key={i.kind}>
                <span className="tag">{KIND_LABEL[i.kind]}</span>
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Bu ölçüde özel bir zorluk yok. Ritmi metronomla oturtmaya odaklan.</p>
        )}
      </section>

      <section className="coach-sec">
        <h3>Tempo merdiveni</h3>
        <div className="ladder">
          <div className="ladder-top">
            <div>
              <div className="ladder-speed num">{pct(ladder.speed)}</div>
              <div className="subtle small">Hedef {pct(ladder.target)}</div>
            </div>
            <div className="ladder-dots" role="img" aria-label={`${ladder.clean} / 3 temiz tur`}>
              {[0, 1, 2].map((i) => <span key={i} className={i < ladder.clean ? 'on' : ''} />)}
            </div>
          </div>
          <div className="ladder-actions">
            <Button variant="ghost" icon={<RotateCcw size={15} />} onClick={onStuck}>Takıldım</Button>
            <Button variant="primary" icon={<Check size={15} />} onClick={onClean}>Temiz çaldım</Button>
          </div>
          <p className="subtle small">{loop ? '' : 'Önce bir ölçüyü döngüye al. '}3 temiz turda hız %5 artar.</p>
        </div>
      </section>

      <section className="coach-sec">
        <h3>Genel öneriler</h3>
        <ul className="tips plain">
          {report.summary.map((s) => (
            <li key={s}><Lightbulb size={15} aria-hidden className="tip-ic" /><span>{s}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
});
