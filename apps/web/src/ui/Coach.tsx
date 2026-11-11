import type { Report } from '../tips/analyze';

const KIND_LABEL: Record<string, string> = {
  shift: 'Pozisyon kayması', stretch: 'Açılım', barre: 'Barre', speed: 'Hız', hammer: 'Hammer-on',
  slide: 'Slide', bend: 'Bend', palmMute: 'Palm mute', chordChange: 'Akor geçişi',
};

interface Props {
  report: Report | null;
  currentBar: number;
  loop: [number, number] | null;
  onBarClick: (bar: number, extend: boolean) => void;
  ladder: { speed: number; clean: number; target: number };
  onClean: () => void;
  onStuck: () => void;
}

export function Coach({ report, currentBar, loop, onBarClick, ladder, onClean, onStuck }: Props) {
  if (!report) return <aside className="coach"><p className="muted">Bir tab yükle, ipuçları burada görünecek.</p></aside>;
  const max = Math.max(1, ...report.bars.map((b) => b.difficulty));
  const focusBar = loop ? loop[0] : currentBar;
  const bar = report.bars[focusBar];

  return (
    <aside className="coach">
      <h3>Ölçü haritası</h3>
      <p className="muted small">Renk zorluğu gösterir. Döngüye almak için ölçüye tıkla, aralık seçmek için Shift ile tıkla.</p>
      <div className="heatmap">
        {report.bars.map((b) => {
          const inLoop = loop && b.bar >= loop[0] && b.bar <= loop[1];
          return (
            <button
              key={b.bar}
              className={`cell${b.bar === currentBar ? ' current' : ''}${inLoop ? ' looped' : ''}`}
              style={{ ['--h' as string]: String(b.difficulty / max) }}
              title={`Ölçü ${b.bar + 1}${b.issues.length ? ': ' + b.issues.map((i) => KIND_LABEL[i.kind]).join(', ') : ''}`}
              onClick={(e) => onBarClick(b.bar, e.shiftKey)}
            >
              {b.bar + 1}
            </button>
          );
        })}
      </div>

      <h3>Ölçü {focusBar + 1}</h3>
      {bar && bar.issues.length ? (
        <ul className="tips">
          {bar.issues.map((i) => (
            <li key={i.kind}>
              <span className="tag">{KIND_LABEL[i.kind]}</span>
              {i.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Bu ölçüde özel bir zorluk yok. Ritmi metronomla oturtmaya odaklan.</p>
      )}

      <h3>Tempo merdiveni</h3>
      <div className="ladder">
        <div className="ladder-speed">%{Math.round(ladder.speed * 100)}</div>
        <div className="dots">{[0, 1, 2].map((i) => <span key={i} className={i < ladder.clean ? 'on' : ''} />)}</div>
        <div className="row">
          <button className="btn ghost" onClick={onStuck}>Takıldım</button>
          <button className="btn primary" onClick={onClean}>Temiz çaldım</button>
        </div>
        <p className="muted small">3 temiz turda hız %5 artar. Hedef %{Math.round(ladder.target * 100)}.</p>
      </div>

      <h3>Genel öneriler</h3>
      <ul className="tips plain">{report.summary.map((s) => <li key={s}>{s}</li>)}</ul>
    </aside>
  );
}
