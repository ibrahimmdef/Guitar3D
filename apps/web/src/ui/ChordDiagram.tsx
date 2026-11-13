import { memo } from 'react';
import { baseFret, type ChordVoicing } from '../music/chords';

/**
 * Classic chord box: strings vertical (low E left), five frets, finger numbers in the dots,
 * × / ○ above the nut and the barre as a bar. Pure SVG, scales with `size`.
 */
export const ChordDiagram = memo(function ChordDiagram({ voicing, size = 120, showFingers = true, title }: { voicing: ChordVoicing; size?: number; showFingers?: boolean; title?: string }) {
  const W = 100;
  const H = 120;
  const left = 18;
  const right = 90;
  const top = 26;
  const fretH = 18;
  const gap = (right - left) / 5;
  const first = baseFret(voicing);
  const start = voicing.frets.some((f) => f > 4) ? first : 1;
  const x = (i: number) => left + i * gap;
  const y = (fret: number) => top + (fret - start + 0.5) * fretH;
  const label = title ?? `${voicing.name} akoru: ${voicing.frets.map((f) => (f < 0 ? 'x' : f)).join(' ')}`;

  return (
    <svg className="chord-diagram" viewBox={`0 0 ${W} ${H}`} width={size} height={(size * H) / W} role="img" aria-label={label}>
      {start === 1 ? (
        <rect x={left - 1} y={top - 3} width={right - left + 2} height={3.5} rx={1} className="cd-nut" />
      ) : (
        <text x={left - 6} y={y(start) + 3.5} className="cd-fretno" textAnchor="end">{start}</text>
      )}
      {[0, 1, 2, 3, 4, 5].map((f) => (
        <line key={`f${f}`} x1={left} x2={right} y1={top + f * fretH} y2={top + f * fretH} className="cd-line" />
      ))}
      {[0, 1, 2, 3, 4, 5].map((s) => (
        <line key={`s${s}`} x1={x(s)} x2={x(s)} y1={top} y2={top + 5 * fretH} className="cd-line" />
      ))}
      {voicing.barre && (
        <rect
          x={x(6 - voicing.barre.from) - 5}
          y={y(voicing.barre.fret) - 5.5}
          width={x(6 - voicing.barre.to) - x(6 - voicing.barre.from) + 10}
          height={11}
          rx={5.5}
          className="cd-barre"
        />
      )}
      {voicing.frets.map((f, i) => {
        if (f < 0) return <text key={i} x={x(i)} y={top - 9} className="cd-mark" textAnchor="middle">×</text>;
        if (f === 0) return <circle key={i} cx={x(i)} cy={top - 12} r={3.6} className="cd-open" />;
        const finger = voicing.fingers[i];
        const onBarre = voicing.barre && f === voicing.barre.fret && 6 - i <= voicing.barre.from && 6 - i >= voicing.barre.to;
        return (
          <g key={i}>
            {!onBarre && <circle cx={x(i)} cy={y(f)} r={6} className="cd-dot" />}
            {showFingers && finger > 0 && (!onBarre || i === 6 - voicing.barre!.from) && (
              <text x={x(i)} y={y(f) + 3.4} className="cd-finger" textAnchor="middle">{finger}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
});
