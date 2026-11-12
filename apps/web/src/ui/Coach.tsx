import { memo } from 'react';
import { Check, Gauge, Lightbulb, Play, Repeat, RotateCcw, Target } from 'lucide-react';
import type { Report } from '../tips/analyze';
import { Button } from './kit';
import { PRACTICE_STEPS, practiceStep } from './practiceFlow';

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
  playing: boolean;
  speed: number;
  /** Loop the given bar and drop to the ladder speed. */
  onPickBar: (bar: number) => void;
  onSlowDown: () => void;
  onPlay: () => void;
}


/** Practice drawer content: bar difficulty map, tips for the focused bar, tempo ladder, summary. */
export const Coach = memo(function Coach({ report, currentBar, loop, onBarClick, ladder, onClean, onStuck, playing, speed, onPickBar, onSlowDown, onPlay }: Props) {
  if (!report) {
    return <p className="muted small">Tab yüklenince ölçü haritası ve ipuçları burada görünecek.</p>;
  }
  const max = Math.max(1, ...report.bars.map((b) => b.difficulty));
  const focusBar = loop ? loop[0] : currentBar;
  const bar = report.bars[focusBar];
  const range = loop ? (loop[0] === loop[1] ? `Ölçü ${loop[0] + 1}` : `Ölçü ${loop[0] + 1}–${loop[1] + 1}`) : null;

  const step = practiceStep({ loop, playing, speed, ladderSpeed: ladder.speed });
  const stepIndex = PRACTICE_STEPS.findIndex((s) => s.step === step);
  const hardest = report.hardestBars[0] ?? currentBar;

  return (
    <div className="coach">
      <section className="flow" aria-labelledby="flow-title">
        <ol className="flow-steps" aria-label="Pratik adımları">
          {PRACTICE_STEPS.map((s, i) => (
            <li key={s.step} className={i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''} aria-current={i === stepIndex ? 'step' : undefined}>
              <span className="flow-dot num" aria-hidden>{i < stepIndex ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
              <span className="flow-label">{s.label}</span>
            </li>
          ))}
        </ol>
        <div className="flow-body">
          {step === 'choose' && (
            <>
              <h3 id="flow-title">Çalışacağın bölümü seç</h3>
              <p className="muted small">Haritadan bir ölçüye tıkla ya da en zor yerden başla. Çalarken <kbd className="kbd">L</kbd> o anki ölçüyü döngüye alır.</p>
              <Button variant="primary" icon={<Target size={16} />} onClick={() => onPickBar(hardest)}>
                {report.hardestBars.length ? `En zor ölçü: ${hardest + 1}` : `Ölçü ${hardest + 1} ile başla`}
              </Button>
            </>
          )}
          {step === 'slow' && (
            <>
              <h3 id="flow-title">Önce yavaş çal</h3>
              <p className="muted small">Temiz çalabildiğin bir hızdan başla. Önerilen hız %{Math.round(ladder.speed * 100)}.</p>
              <Button variant="primary" icon={<Gauge size={16} />} onClick={onSlowDown}>Hızı %{Math.round(ladder.speed * 100)} yap</Button>
            </>
          )}
          {step === 'loop' && (
            <>
              <h3 id="flow-title">Döngüde çal</h3>
              <p className="muted small">Bölüm durmadan tekrar eder. Her turdan sonra temiz çalıp çalmadığını işaretle.</p>
              <Button variant="primary" icon={<Play size={16} fill="currentColor" />} onClick={onPlay}>Döngüyü başlat</Button>
            </>
          )}
          {step === 'climb' && (
            <>
              <h3 id="flow-title" className="flow-title-row">
                <span><Repeat size={15} aria-hidden /> Tur bitince işaretle</span>
                <span className="ladder-dots" role="img" aria-label={`${ladder.clean} / 3 temiz tur`}>
                  {[0, 1, 2].map((i) => <span key={i} className={i < ladder.clean ? 'on' : ''} />)}
                </span>
              </h3>
              <div className="ladder-actions">
                <Button variant="secondary" icon={<RotateCcw size={15} />} onClick={onStuck}>Takıldım</Button>
                <Button variant="primary" icon={<Check size={15} />} onClick={onClean}>Temiz çaldım</Button>
              </div>
              <p className="subtle small">Üst üste 3 temiz turda hız %5 artar · şu an %{Math.round(ladder.speed * 100)}, hedef %{Math.round(ladder.target * 100)}</p>
            </>
          )}
        </div>
      </section>

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
