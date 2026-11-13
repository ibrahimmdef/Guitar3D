import { useEffect, useMemo, useState } from 'react';
import { Activity, Flame } from 'lucide-react';
import type { PracticeSession } from '@guitar3d/shared';
import { Button, EmptyState, Spinner } from '../../ui/kit';
import { relativeTime } from '../../ui/format';
import { navigate, playLesson, playTab, routeHref } from '../../ui/router';
import { ScreenHeader } from '../AppShell';
import { listSessions } from './sessions';
import { dayStreak, formatDuration, statsByRef, todayMinutes, weeklyMinutes } from './stats';

const KIND_LABEL: Record<PracticeSession['kind'], string> = { tab: 'Tab', lesson: 'Ders', routine: 'Rutin', chords: 'Akorlar', scales: 'Gamlar' };

export function ProgressScreen() {
  const [sessions, setSessions] = useState<PracticeSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listSessions()
      .then((s) => alive && setSessions(s))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const now = useMemo(() => new Date(), []);
  const week = useMemo(() => weeklyMinutes(sessions ?? [], now), [sessions, now]);
  const refs = useMemo(() => statsByRef(sessions ?? []).filter((r) => r.kind === 'tab' || r.kind === 'lesson'), [sessions]);
  const streak = dayStreak(sessions ?? [], now);
  const weekTotal = week.reduce((a, d) => a + d.minutes, 0);

  return (
    <div className="screen">
      <ScreenHeader title="İlerleme" description="Çalıştığın süre, gün serin ve her parçada ulaştığın tempo." />
      {error && <EmptyState tone="danger" title="İlerleme yüklenemedi" description={error} />}
      {!sessions && !error && <div className="lib-loading"><Spinner label="Yükleniyor" /></div>}
      {sessions && (
        <>
          <section className="stat-row" aria-label="Özet">
            <div className="stat">
              <span className="stat-label">Bugün</span>
              <span className="stat-value num">{todayMinutes(sessions, now)}<small>dk</small></span>
            </div>
            <div className={`stat${streak > 0 ? ' stat-accent' : ''}`}>
              <span className="stat-label"><Flame size={14} aria-hidden /> Gün serisi</span>
              <span className="stat-value num">{streak}<small>gün</small></span>
            </div>
            <div className="stat">
              <span className="stat-label">Son 7 gün</span>
              <span className="stat-value num">{weekTotal}<small>dk</small></span>
            </div>
            <div className="stat">
              <span className="stat-label">Toplam seans</span>
              <span className="stat-value num">{sessions.length}</span>
            </div>
          </section>

          <section className="progress-card" aria-labelledby="week-title">
            <h2 id="week-title" className="eyebrow">Haftalık dakika</h2>
            <WeekChart days={week} />
          </section>

          <section aria-labelledby="pieces-title">
            <h2 id="pieces-title" className="eyebrow">Parçalar</h2>
            {refs.length === 0 ? (
              <EmptyState
                icon={<Activity size={22} />}
                title="Henüz kayıt yok"
                description="Bir tab ya da ders çaldığında süre, en iyi temiz tempo ve dinleme doğruluğu burada birikir."
                action={<Button variant="primary" onClick={() => navigate({ name: 'library' })}>Kütüphaneye git</Button>}
              />
            ) : (
              <table className="progress-table">
                <thead>
                  <tr>
                    <th scope="col">Parça</th>
                    <th scope="col">Süre</th>
                    <th scope="col">En iyi temiz tempo</th>
                    <th scope="col">En iyi doğruluk</th>
                    <th scope="col">Son</th>
                  </tr>
                </thead>
                <tbody>
                  {refs.map((r) => (
                    <tr key={r.key}>
                      <th scope="row">
                        {r.refId ? <a href={routeHref(r.kind === 'lesson' ? playLesson(r.refId) : playTab(r.refId))}>{r.title}</a> : r.title}
                        <span className="subtle small"> · {KIND_LABEL[r.kind]}</span>
                      </th>
                      <td className="num">{formatDuration(r.seconds)}</td>
                      <td className="num">{r.bestCleanSpeed != null ? <Meter value={r.bestCleanSpeed / 1.5} label={`%${Math.round(r.bestCleanSpeed * 100)}`} /> : '–'}</td>
                      <td className="num">{r.bestAccuracy != null ? <Meter value={r.bestAccuracy / 100} label={`%${r.bestAccuracy}`} /> : '–'}</td>
                      <td className="subtle">{relativeTime(r.lastAt) ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <span className="meter">
      <span className="meter-track" aria-hidden><span style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} /></span>
      <span>{label}</span>
    </span>
  );
}

/** Seven thin bars with rounded tops on a quiet baseline; today's bar and value are labelled. */
function WeekChart({ days }: { days: { key: string; label: string; minutes: number; today: boolean }[] }) {
  const W = 560;
  const H = 180;
  const top = 22;
  const base = H - 26;
  const max = Math.max(10, ...days.map((d) => d.minutes));
  const step = W / days.length;
  const bw = Math.min(36, step * 0.5);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <figure className="week-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Son 7 gün: ${days.map((d) => `${d.label} ${d.minutes} dk`).join(', ')}`}>
        <line x1={0} x2={W} y1={base} y2={base} className="wc-base" />
        {days.map((d, i) => {
          const h = d.minutes ? Math.max(4, ((base - top) * d.minutes) / max) : 0;
          const x = i * step + (step - bw) / 2;
          const showValue = d.today || hover === i;
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * step} y={top - 16} width={step} height={base - top + 40} fill="transparent" />
              {h > 0 && <path d={roundedTop(x, base, bw, h)} className={`wc-bar${d.today ? ' is-today' : ''}`} />}
              {showValue && <text x={x + bw / 2} y={base - h - 6} textAnchor="middle" className="wc-value">{d.minutes} dk</text>}
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" className={`wc-label${d.today ? ' is-today' : ''}`}>{d.today ? 'Bugün' : d.label}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function roundedTop(x: number, base: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2);
  const y = base - h;
  return `M ${x} ${base} V ${y + r} Q ${x} ${y} ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${base} Z`;
}
