import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, ExternalLink, Lock, Mic, MicOff, Play } from 'lucide-react';
import type { FretNote } from '@guitar3d/shared';
import { freqToMidi } from '../../audio/pitch';
import { useMicPitch } from '../../audio/useMicPitch';
import { MIC_STATUS_LABEL } from '../../audio/useMicOnsets';
import { VOICINGS, voicingNotes } from '../../music/chords';
import { advance, COURSE, isUnlocked, LEVEL_TITLES, levelLessons, levelProgress, loadDone, nextLesson, saveDone, type CourseLesson, type Pos } from '../../music/course';
import { noteName } from '../../music/notes';
import { getPattern, parseSteps } from '../../music/rhythm';
import { chordTex, sequenceTex } from '../../music/tex';
import { fretMidi, getTuning } from '../../music/tunings';
import { useTexPlayer } from '../../player/useTexPlayer';
import { setHandoff } from '../../ui/handoff';
import { Button } from '../../ui/kit';
import { navigate, playLesson } from '../../ui/router';
import { useSettings } from '../../ui/settings';
import { ScreenHeader } from '../AppShell';
import { stableNote } from '../games/useCountdown';
import { LearnStage } from '../LearnStage';
import { StrokeGlyph } from '../rhythm/RhythmScreen';

const voicing = (name: string) => VOICINGS.find((v) => v.name === name && v.shape === 'open') ?? VOICINGS.find((v) => v.name === name)!;

/** Positions of a chord from the lowest sounding string to the highest. */
function arpeggioPositions(name: string): Pos[] {
  const v = voicing(name);
  return v.frets.flatMap((f, i) => (f < 0 ? [] : [{ string: 6 - i, fret: f }]));
}

function exerciseTargets(l: CourseLesson): Pos[] | null {
  if (l.exercise.kind === 'play') return l.exercise.notes;
  if (l.exercise.kind === 'arpeggio') return arpeggioPositions(l.exercise.chord);
  return null;
}

export function CourseScreen() {
  const [done, setDone] = useState(loadDone);
  const [id, setId] = useState(() => nextLesson(loadDone())?.id ?? COURSE[0].id);
  const lesson = COURSE.find((l) => l.id === id) ?? COURSE[0];
  useEffect(() => saveDone(done), [done]);

  const complete = (lid: string) => setDone((d) => new Set(d).add(lid));
  const next = nextLesson(done);
  const total = Math.round((100 * done.size) / COURSE.length);

  return (
    <div className="screen">
      <ScreenHeader
        title="Dersler"
        description="Videosuz, kısa ve uygulamalı: oku, gitarda izle, sonra çal. Mikrofon doğru çaldığını kontrol eder."
        actions={next && next.id !== id ? <Button variant="secondary" onClick={() => setId(next.id)}>Sıradaki ders</Button> : undefined}
      />
      <div className="course">
        <nav className="course-nav" aria-label="Müfredat">
          <p className="muted small">Genel ilerleme: <span className="num">%{total}</span></p>
          {[1, 2, 3, 4, 5].map((lv) => {
            const open = isUnlocked(done, lv);
            const pr = levelProgress(done, lv);
            return (
              <div key={lv} className={`course-level${open ? '' : ' is-locked'}`}>
                <h2 className="course-level-title">
                  <span>Seviye {lv} · {LEVEL_TITLES[lv]}</span>
                  <span className="num subtle small">{pr.done}/{pr.total}</span>
                </h2>
                <div className="course-bar" aria-hidden><span style={{ width: `${pr.pct}%` }} /></div>
                <ul className="course-list">
                  {levelLessons(lv).map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        className={`course-item${l.id === id ? ' is-on' : ''}`}
                        aria-current={l.id === id ? 'true' : undefined}
                        onClick={() => setId(l.id)}
                        aria-label={`${l.title}${done.has(l.id) ? ', tamamlandı' : open ? '' : ', kilitli'}`}
                      >
                        <span className="course-item-ic" aria-hidden>
                          {done.has(l.id) ? <CheckCircle2 size={16} /> : open ? <span className="course-dot" /> : <Lock size={14} />}
                        </span>
                        <span>{l.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
        <LessonView key={lesson.id} lesson={lesson} done={done.has(lesson.id)} locked={!isUnlocked(done, lesson.level)} onDone={() => complete(lesson.id)} />
      </div>
    </div>
  );
}

function LessonView({ lesson, done, locked, onDone }: { lesson: CourseLesson; done: boolean; locked: boolean; onDone: () => void }) {
  const [settings] = useSettings();
  const tuning = getTuning(settings.tuningId);
  const player = useTexPlayer();
  const [frame, setFrame] = useState(-1);
  const [beat, setBeat] = useState(0);
  const [mic, setMic] = useState(false);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const [heardText, setHeardText] = useState('');
  const heard = useRef<{ midi: number; frames: number } | null>(null);
  const timer = useRef(0);
  useEffect(() => () => clearInterval(timer.current), []);

  const demo = lesson.demo;
  const targets = useMemo(() => exerciseTargets(lesson), [lesson]);
  const targetMidi = useMemo(() => targets?.map((p) => fretMidi(tuning, p.string, p.fret)) ?? [], [targets, tuning]);

  // what the guitar shows: the exercise while it runs, else the demo
  const notes: FretNote[] = useMemo(() => {
    if (mic && targets) {
      return targets.flatMap((p, i): FretNote[] => (i === idx ? [{ ...p, state: 'now' as const }] : i === idx + 1 ? [{ ...p, state: 'next' as const }] : []));
    }
    if (demo.kind === 'notes') {
      if (frame < 0) return demo.notes.map((p) => ({ ...p, state: 'next' as const }));
      return [{ ...demo.notes[frame], state: 'now' as const }, ...(demo.notes[frame + 1] ? [{ ...demo.notes[frame + 1], state: 'next' as const }] : [])];
    }
    return voicingNotes(voicing(demo.chord));
  }, [demo, frame, mic, targets, idx]);

  const show = () => {
    clearInterval(timer.current);
    if (demo.kind === 'notes') {
      player.play(sequenceTex(demo.notes, { tuning, program: settings.program, tempo: 100 }));
      let i = 0;
      setFrame(0);
      setBeat((b) => b + 1);
      // sequenceTex plays eighth notes: 0.3 s each at 100 BPM
      timer.current = window.setInterval(() => {
        i++;
        if (i >= demo.notes.length) {
          clearInterval(timer.current);
          setFrame(-1);
          return;
        }
        setFrame(i);
        setBeat((b) => b + 1);
      }, 300);
    } else {
      player.play(chordTex(voicing(demo.chord).frets, { tuning, program: settings.program }));
      setBeat((b) => b + 1);
    }
  };

  const micStatus = useMicPitch(mic && !!targets, (p) => {
    const r = stableNote(heard.current, p ? freqToMidi(p.freq) : null, 3);
    heard.current = r.state;
    if (r.stable == null) return;
    const i = idxRef.current;
    const a = advance(targetMidi, i, r.stable);
    setHeardText(a.hit ? 'Doğru' : `Duyulan: ${noteName(r.stable)} · beklenen: ${noteName(targetMidi[i])}`);
    if (a.hit) setBeat((b) => b + 1);
    idxRef.current = a.idx;
    setIdx(a.idx);
    if (a.idx >= targetMidi.length) {
      setMic(false);
      onDone();
    }
  });

  const ex = lesson.exercise;
  const openExercise = () => {
    if (ex.kind === 'lesson') navigate(playLesson(ex.lessonId));
    if (ex.kind === 'screen') {
      if (ex.route === 'rhythm' && ex.patternId) setHandoff('rhythm', ex.patternId);
      if (ex.route === 'chord-trainer' && ex.chords) setHandoff('chord-trainer', ex.chords);
      navigate({ name: ex.route });
    }
  };

  return (
    <article className="course-lesson" aria-labelledby="course-title">
      <header className="learn-title-row">
        <div>
          <p className="muted small">Seviye {lesson.level} · {LEVEL_TITLES[lesson.level]}</p>
          <h2 id="course-title" className="learn-title">{lesson.title}</h2>
        </div>
        {done && <span className="course-done"><Check size={15} aria-hidden /> Tamamlandı</span>}
      </header>
      {locked && <p className="subtle small">Bu seviye, bir önceki seviyenin çoğu bitince açılır. Yine de göz atabilirsin.</p>}
      <div className="course-text">{lesson.text.map((t) => <p key={t}>{t}</p>)}</div>

      <LearnStage notes={notes} beatId={beat} cameraMode={demo.kind === 'notes' && !mic ? 'overview' : 'follow'} label={`${lesson.title}: gösterim`}>
        {demo.kind !== 'notes' && <span className="hud-chip">{demo.chord}</span>}
      </LearnStage>
      <div className="p2-row">
        <Button icon={<Play size={15} fill="currentColor" />} onClick={show}>Göster ve dinlet</Button>
        {demo.kind === 'strum' && (
          <span className="course-strum" aria-label={`Desen: ${getPattern(demo.patternId).name}`}>
            {parseSteps(getPattern(demo.patternId).steps).map((s, i) => <StrokeGlyph key={i} s={s} size={18} />)}
          </span>
        )}
      </div>

      <section className="course-exercise" aria-label="Alıştırma">
        <h3 className="section-title">Alıştırma</h3>
        <p>{ex.prompt}</p>
        {targets ? (
          <>
            <div className="course-targets" aria-label="Notalar">
              {targets.map((p, i) => (
                <span key={i} className={`course-target num${i < idx ? ' is-done' : i === idx && mic ? ' is-now' : ''}`}>
                  {p.string}/{p.fret}
                </span>
              ))}
            </div>
            <div className="p2-row">
              <Button variant={mic ? 'secondary' : 'primary'} icon={mic ? <MicOff size={15} /> : <Mic size={15} />} onClick={() => { setMic((m) => !m); setIdx(0); idxRef.current = 0; setHeardText(''); }}>
                {mic ? 'Durdur' : 'Mikrofonla başla'}
              </Button>
              {!done && <Button variant="ghost" onClick={onDone}>Mikrofonsuz tamamla</Button>}
            </div>
            <p className="subtle small" role="status" aria-live="polite">
              {mic ? `${MIC_STATUS_LABEL[micStatus]} · ${idx}/${targets.length}${heardText ? ` · ${heardText}` : ''}` : 'Tel/perde: 6/0 = 6. tel boş.'}
            </p>
          </>
        ) : (
          <div className="p2-row">
            <Button variant="primary" icon={<ExternalLink size={15} />} onClick={openExercise}>{ex.kind === 'lesson' ? 'Dersi aç' : 'Ekranı aç'}</Button>
            {!done && <Button variant="secondary" icon={<Check size={15} />} onClick={onDone}>Tamamladım</Button>}
          </div>
        )}
        {done && targets && <p className="game-feedback is-ok" role="status">Harika, bu alıştırma tamam.</p>}
      </section>
    </article>
  );
}
