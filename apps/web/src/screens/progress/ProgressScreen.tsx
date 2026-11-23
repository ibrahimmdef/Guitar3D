import { useEffect, useMemo, useState } from 'react';
import { Activity, Award, Flame } from 'lucide-react';
import { useSettings } from '../../ui/settings';
import { ALL_BADGES, earnedBadges, weekMinutes } from './badges';
import type { PracticeSession, SectionProgress, TabProgress } from '@guitar3d/shared';
import { cleanLabel, cleanTempoBySession, sectionLabel, type SessionPoint } from '../../coach/progress';
import { listAllProgress, listTabs } from '../data';
import { listLessons } from '../library/lessons';
import { Button, EmptyState, Spinner } from '../../ui/kit';
import { relativeTime } from '../../ui/format';
import { navigate, playLesson, playTab, routeHref } from '../../ui/router';
import { ScreenHeader } from '../AppShell';
import { listSessions } from './sessions';
import { dayStreak, formatDuration, statsByRef, todayMinutes, weeklyMinutes } from './stats';

const KIND_LABEL: Record<PracticeSession['kind'], string> = { tab: 'Tab', lesson: 'Lesson', routine: 'Routine', chords: 'Chords', scales: 'Scales' };

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
  const [settings, setSettings] = useSettings();
  const goal = settings.weeklyGoalMinutes;
  const thisWeek = weekMinutes(sessions ?? [], now);
  const earned = useMemo(() => new Set(earnedBadges({ sessions: sessions ?? [], weeklyGoalMinutes: goal })), [sessions, goal]);

  return (
    <div className="screen">
      <ScreenHeader title="Progress" description="Your practice time, day streak and the tempo you've reached on each piece." />
      {error && <EmptyState tone="danger" title="Couldn't load progress" description={error} />}
      {!sessions && !error && <div className="lib-loading"><Spinner label="Loading" /></div>}
      {sessions && (
        <>
          <section className="stat-row" aria-label="Summary">
            <div className="stat">
              <span className="stat-label">Today</span>
              <span className="stat-value num">{todayMinutes(sessions, now)}<small>min</small></span>
            </div>
            <div className={`stat${streak > 0 ? ' stat-accent' : ''}`}>
              <span className="stat-label"><Flame size={14} aria-hidden /> Day streak</span>
              <span className="stat-value num">{streak}<small>days</small></span>
            </div>
            <div className="stat">
              <span className="stat-label">Last 7 days</span>
              <span className="stat-value num">{weekTotal}<small>min</small></span>
            </div>
            <div className="stat">
              <span className="stat-label">Total sessions</span>
              <span className="stat-value num">{sessions.length}</span>
            </div>
          </section>

          <section className="progress-card goal-card" aria-labelledby="goal-title">
            <div className="goal-head">
              <h2 id="goal-title" className="eyebrow">Weekly goal</h2>
              <label className="field goal-field">
                Goal
                <select className="select" value={goal} onChange={(e) => setSettings({ weeklyGoalMinutes: Number(e.target.value) })}>
                  {[30, 60, 90, 120, 180, 300, 420].map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </label>
            </div>
            <Meter value={thisWeek / Math.max(1, goal)} label={`${thisWeek} / ${goal} min`} />
            <p className="subtle small">{thisWeek >= goal ? 'This week\'s goal is done.' : `${goal - thisWeek} min left this week (since Monday).`}</p>
          </section>

          <section className="progress-card" aria-labelledby="badge-title">
            <h2 id="badge-title" className="eyebrow">Badges · {earned.size}/{ALL_BADGES.length}</h2>
            <ul className="badge-grid">
              {ALL_BADGES.map((b) => {
                const on = earned.has(b.id);
                return (
                  <li key={b.id} className={`badge${on ? ' is-on' : ''}`} title={b.description}>
                    <Award size={18} aria-hidden />
                    <span className="badge-title">{b.title}</span>
                    <span className="sr-only">{on ? 'earned' : 'not earned yet'}: {b.description}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <TrainerProgress />

          <section className="progress-card" aria-labelledby="week-title">
            <h2 id="week-title" className="eyebrow">Minutes per week</h2>
            <WeekChart days={week} />
          </section>

          <section aria-labelledby="pieces-title">
            <h2 id="pieces-title" className="eyebrow">Pieces</h2>
            {refs.length === 0 ? (
              <EmptyState
                icon={<Activity size={22} />}
                title="Nothing recorded yet"
                description="When you play a tab or lesson, your time, best clean tempo and listening accuracy build up here."
                action={<Button variant="primary" onClick={() => navigate({ name: 'library' })}>Go to library</Button>}
              />
            ) : (
              <table className="progress-table">
                <thead>
                  <tr>
                    <th scope="col">Piece</th>
                    <th scope="col">Time</th>
                    <th scope="col">Best clean tempo</th>
                    <th scope="col">Best accuracy</th>
                    <th scope="col">Last</th>
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
                      <td className="num">{r.bestCleanSpeed != null ? <Meter value={r.bestCleanSpeed / 1.5} label={`${Math.round(r.bestCleanSpeed * 100)}%`} /> : '–'}</td>
                      <td className="num">{r.bestAccuracy != null ? <Meter value={r.bestAccuracy / 100} label={`${r.bestAccuracy}%`} /> : '–'}</td>
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
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Last 7 days: ${days.map((d) => `${d.label} ${d.minutes} min`).join(', ')}`}>
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
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" className={`wc-label${d.today ? ' is-today' : ''}`}>{d.today ? 'Today' : d.label}</text>
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

interface TrainerRow {
  key: string;
  tabId: string;
  title: string;
  section: SectionProgress;
}

const refRoute = (tabId: string) => (tabId.startsWith('lesson:') ? playLesson(tabId.slice(7)) : playTab(tabId));

/** Speed trainer: each practised section, "Clean at 85% — 12 BPM to go", and its clean tempo over sessions. */
function TrainerProgress() {
  const [progress, setProgress] = useState<TabProgress[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    listAllProgress().then((p) => alive && setProgress(p)).catch(() => alive && setProgress([]));
    listTabs().then((ts) => alive && setTitles((t) => ({ ...t, ...Object.fromEntries(ts.map((x) => [x.id, x.title || x.fileName])) }))).catch(() => {});
    listLessons().then((ls) => alive && setTitles((t) => ({ ...t, ...Object.fromEntries(ls.map((l) => [`lesson:${l.id}`, l.title])) }))).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const rows = useMemo<TrainerRow[]>(() => (progress ?? [])
    .flatMap((p) => p.sections.filter((x) => x.history?.length || x.bestCleanSpeed > 0).map((section) => ({ key: `${p.tabId}#${section.startBar}-${section.endBar}`, tabId: p.tabId, title: titles[p.tabId] ?? (p.tabId.startsWith('lesson:') ? 'Lesson' : 'Tab'), section })))
    .sort((a, b) => b.section.updatedAt.localeCompare(a.section.updatedAt)), [progress, titles]);
  if (!progress || rows.length === 0) return null;
  const sel = rows.find((r) => r.key === picked) ?? rows[0];
  const points = cleanTempoBySession(sel.section.history);
  return (
    <section className="progress-card" aria-labelledby="trainer-title">
      <h2 id="trainer-title" className="eyebrow">Speed trainer · clean tempo</h2>
      <ul className="trainer-rows">
        {rows.slice(0, 12).map((r) => (
          <li key={r.key}>
            <button type="button" className={`trainer-row${r.key === sel.key ? ' is-on' : ''}`} aria-pressed={r.key === sel.key} onClick={() => setPicked(r.key)}>
              <span className="trainer-row-title">{r.title}<span className="subtle"> · {sectionLabel(r.section)}</span></span>
              <span className="num small">{cleanLabel(r.section)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="trainer-chart-head">
        <span className="small"><b>{sel.title}</b> · {sectionLabel(sel.section)}{sel.section.bpm ? ` · ${sel.section.bpm} BPM at full speed` : ''}</span>
        <a className="small" href={routeHref(refRoute(sel.tabId))}>Practice</a>
      </div>
      {points.length ? <TempoChart points={points} bpm={sel.section.bpm} /> : <p className="subtle small">No speed-trainer passes yet for this section.</p>}
    </section>
  );
}

/** Fastest clean pass per session as a line, with full speed as a dashed reference. */
function TempoChart({ points, bpm }: { points: SessionPoint[]; bpm?: number }) {
  const W = 560;
  const H = 180;
  const left = 40;
  const right = 16;
  const top = 16;
  const base = H - 26;
  const vals = points.flatMap((p) => (p.speed != null ? [p.speed] : []));
  const hasCleanPasses = vals.length > 0;
  const lo = hasCleanPasses ? Math.max(0, Math.floor((Math.min(0.6, ...vals) - 0.05) * 20) / 20) : 0.5;
  const hi = hasCleanPasses ? Math.max(1.05, Math.ceil((Math.max(...vals, 1) + 0.02) * 20) / 20) : 1.1;
  const y = (v: number) => base - ((v - lo) / (hi - lo)) * (base - top);
  const step = points.length > 1 ? (W - left - right) / (points.length - 1) : 0;
  const x = (i: number) => (points.length > 1 ? left + i * step : (left + W - right) / 2);
  const [hover, setHover] = useState<number | null>(null);
  const path = points.reduce((d, p, i) => (p.speed == null ? d : `${d}${d && points[i - 1]?.speed != null ? ' L' : ' M'} ${x(i).toFixed(1)} ${y(p.speed).toFixed(1)}`), '').trim();
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const lastClean = [...points].reverse().find((p) => p.speed != null);
  const ticks = hasCleanPasses ? [lo, (lo + hi) / 2, 1].filter((v, i, a) => a.indexOf(v) === i) : [0.5, 0.8, 1];
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  return (
    <figure className="week-chart tempo-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Clean tempo per session: ${points.map((p) => `${day(p.at)} ${p.speed != null ? `${Math.round(p.speed * 100)}%` : 'no clean pass'}`).join(', ')}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} className={t === 1 ? 'tc-full' : 'tc-grid'} />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" className="wc-label">{Math.round(t * 100)}%</text>
          </g>
        ))}
        {path && <path d={path} className="tc-line" />}
        {points.map((p, i) => (
          <g key={p.at} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - Math.max(10, step / 2)} y={top - 10} width={Math.max(20, step)} height={base - top + 30} fill="transparent" />
            {p.speed != null ? <circle cx={x(i)} cy={y(p.speed)} r={4.5} className="tc-dot" /> : <circle cx={x(i)} cy={base} r={3.5} className="tc-none" />}
            {(hover === i || (hover == null && p === lastClean)) && (
              <text x={Math.min(W - right - 30, Math.max(left + 30, x(i)))} y={(p.speed != null ? y(p.speed) : base) - 10} textAnchor="middle" className="wc-value">
                {p.speed != null ? `${Math.round(p.speed * 100)}%${bpm ? ` · ${Math.round(bpm * p.speed)} BPM` : ''}` : `no clean pass (${p.passes})`}
              </text>
            )}
            {(i % labelEvery === 0 || i === points.length - 1) && <text x={x(i)} y={H - 8} textAnchor="middle" className="wc-label">{day(p.at)}</text>}
          </g>
        ))}
      </svg>
      <figcaption className="subtle small">Fastest clean pass in each session; the dashed line is full speed. Hollow dots: sessions without a clean pass.</figcaption>
    </figure>
  );
}
