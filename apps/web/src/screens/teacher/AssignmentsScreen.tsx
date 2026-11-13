import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Play, Trash2 } from 'lucide-react';
import type { Assignment, PracticeSession, TabMeta } from '@guitar3d/shared';
import { Button, EmptyState, IconButton, SegmentedControl, Spinner, useToast } from '../../ui/kit';
import { navigate, playLesson, playTab } from '../../ui/router';
import { ScreenHeader } from '../AppShell';
import { listTabs } from '../data';
import { listLessons, type LessonMeta } from '../library/lessons';
import { listSessions } from '../progress/sessions';
import { assignmentProgress, teacherApi, type AssignmentStatus } from './api';

const STATUS: Record<AssignmentStatus, string> = { done: 'Tamam', late: 'Gecikti', open: 'Devam ediyor' };
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/**
 * Minimal teacher mode without accounts: the teacher adds assignments (piece, target tempo, due
 * date) on this server; the student view shows them with progress from the practice sessions.
 */
export function AssignmentsScreen() {
  const toast = useToast();
  const [mode, setMode] = useState<'student' | 'teacher'>('student');
  const [items, setItems] = useState<Assignment[] | null>(null);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [tabs, setTabs] = useState<TabMeta[]>([]);
  const [lessons, setLessons] = useState<LessonMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [piece, setPiece] = useState('');
  const [target, setTarget] = useState(100);
  const [due, setDue] = useState(inDays(7));
  const [note, setNote] = useState('');

  const load = () => {
    teacherApi.assignments().then(setItems).catch((e: Error) => {
      setItems([]);
      setError(e.message);
    });
    listSessions().then(setSessions).catch(() => {});
  };
  useEffect(() => {
    load();
    listTabs().then(setTabs).catch(() => {});
    listLessons().then(setLessons).catch(() => {});
  }, []);

  const pieces = useMemo(
    () => [...tabs.map((t) => ({ key: t.id, title: t.title || t.fileName })), ...lessons.map((l) => ({ key: `lesson:${l.id}`, title: l.title }))],
    [tabs, lessons],
  );

  const add = async () => {
    const p = pieces.find((x) => x.key === piece);
    if (!p) return;
    try {
      await teacherApi.addAssignment({ tabKey: p.key, title: p.title, targetSpeed: target / 100, due, ...(note.trim() ? { note: note.trim() } : {}) });
      setNote('');
      load();
      toast({ tone: 'success', title: 'Ödev eklendi.' });
    } catch (e) {
      toast({ tone: 'danger', title: 'Ödev eklenemedi.', description: (e as Error).message });
    }
  };

  const open = (a: Assignment) => navigate(a.tabKey.startsWith('lesson:') ? playLesson(a.tabKey.slice(7)) : playTab(a.tabKey));

  return (
    <div className="screen">
      <ScreenHeader
        title="Ödevler"
        description="Öğretmen parça, hedef tempo ve teslim tarihi verir; öğrenci ilerlemesini burada görür."
        actions={<SegmentedControl aria-label="Görünüm" value={mode} onChange={setMode} options={[{ value: 'student', label: 'Öğrenci' }, { value: 'teacher', label: 'Öğretmen' }]} />}
      />

      {mode === 'teacher' && (
        <section className="progress-card asg-form" aria-labelledby="asg-new">
          <h2 id="asg-new" className="eyebrow">Yeni ödev</h2>
          <div className="bk-row">
            <label className="field">
              Parça
              <select className="select" value={piece} onChange={(e) => setPiece(e.target.value)}>
                <option value="">Seç…</option>
                {tabs.length > 0 && <optgroup label="Tablar">{tabs.map((t) => <option key={t.id} value={t.id}>{t.title || t.fileName}</option>)}</optgroup>}
                <optgroup label="Dersler">{lessons.map((l) => <option key={l.id} value={`lesson:${l.id}`}>{l.title}</option>)}</optgroup>
              </select>
            </label>
            <label className="field">
              Hedef tempo
              <select className="select" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                {[60, 70, 80, 90, 100, 110, 120].map((v) => <option key={v} value={v}>%{v}</option>)}
              </select>
            </label>
            <label className="field">
              Teslim
              <input className="input" type="date" value={due} min={today()} onChange={(e) => setDue(e.target.value)} />
            </label>
          </div>
          <label className="field">
            Not (isteğe bağlı)
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. 5–8. ölçülerde alternatif pena" maxLength={1000} />
          </label>
          <div>
            <Button variant="primary" onClick={add} disabled={!piece || !due}>Ödev ekle</Button>
          </div>
          <p className="subtle small">Ölçülere not eklemek için parçayı aç; Çalış panelindeki “Ölçü notları” bölümünü kullan. Hesap yok: ödevler bu sunucuda tutulur.</p>
        </section>
      )}

      {items === null ? (
        <div className="lib-loading"><Spinner label="Yükleniyor" /></div>
      ) : error ? (
        <EmptyState tone="danger" title="Ödevler yüklenemedi" description={error} />
      ) : items.length === 0 ? (
        <EmptyState icon={<ClipboardList size={22} />} title="Ödev yok" description={mode === 'teacher' ? 'Yukarıdan ilk ödevi ekle.' : 'Öğretmenin ödev eklediğinde burada görünür.'} />
      ) : (
        <ul className="asg-list">
          {items.map((a) => {
            const p = assignmentProgress(a, sessions);
            return (
              <li key={a.id} className={`asg asg-${p.status}`}>
                <div className="asg-main">
                  <span className="asg-title">{a.title}</span>
                  <span className="subtle small">Teslim {new Date(`${a.due}T12:00:00`).toLocaleDateString('tr-TR')} · hedef %{Math.round(a.targetSpeed * 100)}</span>
                  {a.note && <span className="small">{a.note}</span>}
                </div>
                <div className="asg-progress">
                  <span className="meter">
                    <span className="meter-track" aria-hidden><span style={{ width: `${Math.min(100, ((p.best ?? 0) / a.targetSpeed) * 100)}%` }} /></span>
                    <span className="num">{p.best == null ? '–' : `%${Math.round(p.best * 100)}`}</span>
                  </span>
                  <span className="subtle small num">{p.minutes} dk · {STATUS[p.status]}</span>
                </div>
                <div className="asg-actions">
                  <Button size="sm" icon={<Play size={14} fill="currentColor" />} onClick={() => open(a)}>Çalış</Button>
                  {mode === 'teacher' && <IconButton size="sm" label="Ödevi sil" icon={<Trash2 size={14} />} onClick={() => void teacherApi.deleteAssignment(a.id).then(load)} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
