import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, CloudOff, FileMusic, FileText, GraduationCap, Image as ImageIcon, Guitar, Play, Search, Trash, Upload } from 'lucide-react';
import type { TabMeta, TabProgress } from '@guitar3d/shared';
import { Button, Dialog, EmptyState, IconButton, SegmentedControl, Spinner, useToast } from '../../ui/kit';
import { navigate, playLesson, playTab } from '../../ui/router';
import { getRecent } from '../../ui/settings';
import { relativeTime } from '../../ui/format';
import { ScreenHeader } from '../AppShell';
import { bestSpeed, deleteTab, listAllProgress, listTabs } from '../data';
import { cleanLabel, focusSection, sectionLabel } from '../../coach/progress';
import { groupByLevel, groupByRank, LEVEL_LABEL, listLessons, type LessonMeta } from './lessons';
import { TabImportSlot } from './TabImportSlot';

// The import dialogs preview tabs with alphaTab (1.2 MB): load them only when one is opened.
const TextImportDialog = lazy(() => import('./TextImport').then((m) => ({ default: m.TextImportDialog })));
const ImageImportDialog = lazy(() => import('./TextImport').then((m) => ({ default: m.ImageImportDialog })));

type Sort = 'recent' | 'title' | 'added';

const collator = new Intl.Collator('en');
const norm = (s: string) => s.toLowerCase();

export function LibraryScreen() {
  const toast = useToast();
  const [tabs, setTabs] = useState<TabMeta[] | null>(null);
  const [lessons, setLessons] = useState<LessonMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, TabProgress>>({});
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [confirm, setConfirm] = useState<TabMeta | null>(null);
  const recent = useMemo(() => getRecent(), []);
  const [importMode, setImportMode] = useState<'text' | 'image' | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);

  const load = useCallback(() => {
    setError(null);
    listTabs()
      .then((ts) => {
        setTabs(ts);
        listAllProgress().then((ps) => setProgress(Object.fromEntries(ps.map((p) => [p.tabId, p])))).catch(() => {});
      })
      .catch(() => {
        setTabs([]);
        setError('Couldn\'t open this browser\'s storage, so your own tabs can\'t be shown right now. Lessons still work.');
      });
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    listLessons().then(setLessons).catch(() => setLessons([]));
  }, []);

  const q = norm(query.trim());
  const visibleTabs = useMemo(() => {
    const list = (tabs ?? []).filter((t) => !q || norm(`${t.title} ${t.artist} ${t.fileName}`).includes(q));
    return [...list].sort((a, b) => {
      if (sort === 'title') return collator.compare(a.title, b.title);
      if (sort === 'added') return b.uploadedAt.localeCompare(a.uploadedAt);
      return (recent[b.id] ?? b.uploadedAt).localeCompare(recent[a.id] ?? a.uploadedAt);
    });
  }, [tabs, q, sort, recent]);
  const visibleLessons = useMemo(() => (lessons ?? []).filter((l) => !q || norm(`${l.title} ${l.description ?? ''}`).includes(q)), [lessons, q]);
  const regularLessons = visibleLessons.filter((l) => !l.group);
  const turkuler = visibleLessons.filter((l) => l.group === 'turkuler');
  const eserler = visibleLessons.filter((l) => l.group === 'eserler');

  const firstRun = tabs !== null && tabs.length === 0;
  const firstLesson = lessons?.find((l) => l.level === 'beginner' && !l.group) ?? lessons?.[0];

  const remove = async (t: TabMeta) => {
    setConfirm(null);
    try {
      await deleteTab(t.id);
      setTabs((x) => x?.filter((y) => y.id !== t.id) ?? null);
      toast({ tone: 'info', title: `“${t.title}” deleted.` });
    } catch (e) {
      toast({ tone: 'danger', title: 'Couldn\'t delete the tab.', description: (e as Error).message });
    }
  };

  const savedImport = (t: TabMeta) => onAdded([t]);
  const onAdded = (added: TabMeta[]) => {
    setTabs((x) => [...added, ...(x ?? []).filter((t) => !added.some((a) => a.id === t.id))]);
    toast({
      tone: 'success',
      title: added.length === 1 ? `“${added[0].title}” added.` : `${added.length} tabs added.`,
      description: added.length === 1 ? 'Click the card to open it.' : undefined,
    });
  };

  const importer = (
    <>
    <TabImportSlot
      onImported={onAdded}
        onReadable={(f) => { setImportFile(f); setImportMode('image'); }}
      onError={(m) => toast({ tone: 'danger', title: 'Couldn\'t upload the file.', description: m, durationMs: 7000 })}
    />
    <div className="lib-import-row">
      <Button variant="secondary" icon={<FileText size={15} />} onClick={() => setImportMode('text')}>Import from text</Button>
      <Button variant="secondary" icon={<ImageIcon size={15} />} onClick={() => { setImportFile(null); setImportMode('image'); }}>From PDF / image</Button>
    </div>
    </>
  );

  return (
    <div className="screen">
      <ScreenHeader title="Library" description={firstRun ? undefined : 'Pick a tab or a lesson and start practicing on the 3D guitar.'} />

      {firstRun && !error && (
        <section className="welcome" aria-labelledby="welcome-title">
          <h2 id="welcome-title">Welcome. Where do you want to start?</h2>
          <ul className="welcome-steps">
            <WelcomeStep
              icon={<GraduationCap size={20} />}
              title="Play your first lesson"
              text={firstLesson ? `Start with “${firstLesson.title}”. The notes are shown on the guitar.` : 'Start with one of the built-in lessons.'}
              action={firstLesson && <Button variant="primary" icon={<Play size={15} fill="currentColor" />} onClick={() => navigate(playLesson(firstLesson.id))}>Start lesson</Button>}
            />
            <WelcomeStep
              icon={<Guitar size={20} />}
              title="Add your guitar"
              text="Build your own guitar from two photos, or keep using the built-in model."
              action={<Button variant="secondary" iconRight={<ArrowRight size={15} />} onClick={() => navigate({ name: 'guitar' })}>My guitars</Button>}
            />
            <WelcomeStep
              icon={<Upload size={20} />}
              title="Upload your own tab"
              text="Drag and drop your Guitar Pro or MusicXML file."
              action={<Button variant="secondary" iconRight={<ArrowRight size={15} />} onClick={() => document.getElementById('sec-import')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Upload area</Button>}
            />
          </ul>
        </section>
      )}

      {(tabs === null || tabs.length > 0 || error) && (
        <section className="lib-sec" aria-labelledby="sec-tabs">
          <div className="sec-head">
            <h2 id="sec-tabs">My tabs</h2>
            {tabs && tabs.length > 0 && (
              <SegmentedControl
                aria-label="Sort by"
                value={sort}
                onChange={setSort}
                size="sm"
                options={[
                  { value: 'recent', label: 'Last played' },
                  { value: 'title', label: 'Title' },
                  { value: 'added', label: 'Date added' },
                ]}
              />
            )}
          </div>
          {(tabs?.length ?? 0) + (lessons?.length ?? 0) > 6 && (
            <label className="search">
              <Search size={16} aria-hidden className="search-ic" />
              <span className="sr-only">Search tabs and lessons</span>
              <input type="search" placeholder="Search songs, artists or lessons" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          )}
          {error ? (
            <EmptyState compact tone="danger" icon={<CloudOff size={22} />} title="Couldn't load tabs" description={error} action={<Button onClick={load}>Try again</Button>} />
          ) : tabs === null ? (
            <div className="lib-loading" role="status"><Spinner label="Loading tabs" /> Loading tabs…</div>
          ) : (
            <>
              <ul className="lib-grid" aria-label="Tabs">
                {visibleTabs.map((t) => {
                  const focus = focusSection(progress[t.id]);
                  const best = focus ? focus.bestCleanSpeed || null : bestSpeed(progress[t.id]);
                  const label = focus ? `${sectionLabel(focus)}: ${cleanLabel(focus)}` : null;
                  const played = relativeTime(recent[t.id]);
                  return (
                    <li key={t.id} className="tab-card-wrap">
                      <button type="button" className="tab-card" onClick={() => navigate(playTab(t.id))}>
                        <span className="tab-card-ic" aria-hidden><FileMusic size={18} /></span>
                        <span className="tab-card-title">{t.title || t.fileName}</span>
                        <span className="tab-card-sub">{t.artist || 'Unknown artist'}</span>
                        <span className="tab-card-meta">
                          {played ? `Last played ${played}` : 'Not played yet'}
                        </span>
                        <span className="tab-card-progress" aria-label={label ?? 'No practice yet'} title={label ?? undefined}>
                          <span className="bar"><span style={{ width: `${Math.min(1, best ?? 0) * 100}%` }} /></span>
                          <span className="num">{best == null ? '—' : `${Math.round(best * 100)}%`}</span>
                        </span>
                        {label && <span className="tab-card-clean num">{label}</span>}
                        <span className="tab-card-play" aria-hidden><Play size={16} fill="currentColor" /></span>
                      </button>
                      <IconButton className="tab-card-del" label={`Delete tab “${t.title}”`} icon={<Trash size={16} />} size="sm" onClick={() => setConfirm(t)} />
                    </li>
                  );
                })}
              </ul>
              {q && visibleTabs.length === 0 && <p className="subtle small">No tabs match “{query}”.</p>}
              {importer}
            </>
          )}
        </section>
      )}

      <section className="lib-sec" aria-labelledby="sec-lessons">
        <div className="sec-head">
          <h2 id="sec-lessons">Lessons</h2>
        </div>
        {lessons === null ? (
          <div className="lib-loading" role="status"><Spinner label="Loading lessons" /> Loading lessons…</div>
        ) : regularLessons.length === 0 ? (
          <p className="subtle small">{q ? `No lessons match “${query}”.` : 'No lessons right now.'}</p>
        ) : (
          groupByLevel(regularLessons).map((g) => (
            <div key={g.level} className="lesson-group">
              <h3 className="eyebrow">{LEVEL_LABEL[g.level]}</h3>
              <LessonGrid label={`${LEVEL_LABEL[g.level]} lessons`} items={g.items} recent={recent} />
            </div>
          ))
        )}
      </section>

      {turkuler.length > 0 && (
        <section className="lib-sec" aria-labelledby="sec-turkuler">
          <div className="sec-head">
            <h2 id="sec-turkuler">Turkish folk</h2>
          </div>
          <p className="subtle small">Original études in Turkish folk style, with Hicaz, Kürdi and Nihavend colors and halay, horon and aksak rhythms. Easiest first.</p>
          <LessonGrid label="Turkish folk" items={turkuler} recent={recent} showLevel />
        </section>
      )}

      {eserler.length > 0 && (
        <section className="lib-sec" aria-labelledby="sec-eserler">
          <div className="sec-head">
            <h2 id="sec-eserler">Classics</h2>
          </div>
          <p className="subtle small">Famous themes from Bach, Mozart, Beethoven, Tárrega and traditional tunes; short arrangements for guitar. Intermediate to hard.</p>
          {groupByRank(eserler).map((g) => (
            <div key={g.rank} className="lesson-group">
              <h3 className="eyebrow">{g.label}</h3>
              <LessonGrid label={`Eserler, ${g.label}`} items={g.items} recent={recent} />
            </div>
          ))}
        </section>
      )}

      {firstRun && !error && (
        <section className="lib-sec" aria-labelledby="sec-import">
          <div className="sec-head">
            <h2 id="sec-import">Add your own tabs</h2>
          </div>
          {importer}
        </section>
      )}

      <Suspense fallback={null}>
      {importMode === 'text' && <TextImportDialog open onOpenChange={(o) => !o && setImportMode(null)} onSaved={savedImport} />}
      {importMode === 'image' && <ImageImportDialog open initialFile={importFile} onOpenChange={(o) => { if (!o) { setImportMode(null); setImportFile(null); } }} onSaved={savedImport} />}
      </Suspense>

      <Dialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this tab?"
        description={confirm ? `“${confirm.title}” and its practice history will be permanently deleted. This can't be undone.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" icon={<Trash size={15} />} onClick={() => confirm && remove(confirm)}>Delete</Button>
          </>
        }
      />
    </div>
  );
}

function WelcomeStep({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <li className="welcome-step">
      <div className="welcome-ic" aria-hidden>{icon}</div>
      <div className="welcome-text">
        <p className="welcome-title">{title}</p>
        <p className="muted small">{text}</p>
      </div>
      {action && <div className="welcome-action">{action}</div>}
    </li>
  );
}

function LessonGrid({ label, items, recent, showLevel }: { label: string; items: LessonMeta[]; recent: Record<string, string>; showLevel?: boolean }) {
  return (
    <ul className="lib-grid" aria-label={label}>
      {items.map((l) => {
        const played = relativeTime(recent[`lesson:${l.id}`]);
        return (
          <li key={l.id}>
            <button type="button" className="tab-card lesson-card" onClick={() => navigate(playLesson(l.id))}>
              <span className="tab-card-title">{l.title}</span>
              <span className="tab-card-sub">{[showLevel ? LEVEL_LABEL[l.level] : '', l.tempo ? `${l.tempo} BPM` : showLevel ? '' : LEVEL_LABEL[l.level]].filter(Boolean).join(' · ')}</span>
              {l.description && <span className="tab-card-desc">{l.description}</span>}
              <span className="tab-card-meta">{played ? `Last played ${played}` : 'New'}</span>
              <span className="tab-card-play" aria-hidden><Play size={16} fill="currentColor" /></span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
