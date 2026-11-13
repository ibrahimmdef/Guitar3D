import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings, Assignment, BarNote, GuitarProfile, PracticeSession, TabMeta, TabProgress } from '@guitar3d/shared';
import { BUILTIN_GUITAR_ID } from '@guitar3d/shared';

interface DbShape {
  tabs: TabMeta[];
  progress: Record<string, TabProgress>;
  guitars: Record<string, GuitarProfile>;
  settings: AppSettings;
  sessions: PracticeSession[];
  notes: BarNote[];
  assignments: Assignment[];
}

/** Oldest sessions are dropped beyond this many. */
export const MAX_SESSIONS = 20000;

export class Store {
  readonly tabsDir: string;
  readonly guitarsDir: string;
  private readonly dbFile: string;
  private db: DbShape;

  constructor(readonly dataDir: string) {
    this.tabsDir = path.join(dataDir, 'tabs');
    this.guitarsDir = path.join(dataDir, 'guitars');
    this.dbFile = path.join(dataDir, 'db.json');
    fs.mkdirSync(this.tabsDir, { recursive: true });
    fs.mkdirSync(this.guitarsDir, { recursive: true });
    const loaded = fs.existsSync(this.dbFile) ? (JSON.parse(fs.readFileSync(this.dbFile, 'utf8')) as Partial<DbShape>) : {};
    // Older db.json files only had tabs + progress.
    this.db = {
      tabs: loaded.tabs ?? [],
      progress: loaded.progress ?? {},
      guitars: loaded.guitars ?? {},
      settings: { activeGuitarId: BUILTIN_GUITAR_ID, ...loaded.settings },
      sessions: loaded.sessions ?? [],
      notes: loaded.notes ?? [],
      assignments: loaded.assignments ?? [],
    };
  }

  private save() {
    const tmp = `${this.dbFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.dbFile);
  }

  // ---- tabs -------------------------------------------------------------------------------

  listTabs() {
    return [...this.db.tabs].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  getTab(id: string) {
    return this.db.tabs.find((t) => t.id === id);
  }

  addTab(meta: TabMeta) {
    this.db.tabs.push(meta);
    this.save();
    return meta;
  }

  updateTab(id: string, patch: Partial<Pick<TabMeta, 'title' | 'artist' | 'lastPlayedAt'>>) {
    const tab = this.getTab(id);
    if (!tab) return undefined;
    Object.assign(tab, patch);
    this.save();
    return tab;
  }

  deleteTab(id: string) {
    const tab = this.getTab(id);
    if (!tab) return false;
    this.db.tabs = this.db.tabs.filter((t) => t.id !== id);
    delete this.db.progress[id];
    fs.rmSync(path.join(this.tabsDir, tab.fileName), { force: true });
    this.save();
    return true;
  }

  // ---- progress ---------------------------------------------------------------------------

  getProgress(tabId: string): TabProgress {
    return this.db.progress[tabId] ?? { tabId, sections: [] };
  }

  putProgress(p: TabProgress) {
    this.db.progress[p.tabId] = p;
    this.save();
    return p;
  }

  // ---- practice sessions ------------------------------------------------------------------

  listSessions() {
    return [...this.db.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  addSession(s: PracticeSession) {
    this.db.sessions.push(s);
    if (this.db.sessions.length > MAX_SESSIONS) this.db.sessions.splice(0, this.db.sessions.length - MAX_SESSIONS);
    this.save();
    return s;
  }

  // ---- teacher mode: bar notes and assignments ------------------------------------------

  listNotes(tabKey?: string) {
    return this.db.notes.filter((n) => !tabKey || n.tabKey === tabKey).sort((a, b) => a.bar - b.bar || a.createdAt.localeCompare(b.createdAt));
  }

  addNote(n: BarNote) {
    this.db.notes.push(n);
    this.save();
    return n;
  }

  deleteNote(id: string) {
    const before = this.db.notes.length;
    this.db.notes = this.db.notes.filter((n) => n.id !== id);
    if (this.db.notes.length === before) return false;
    this.save();
    return true;
  }

  listAssignments() {
    return [...this.db.assignments].sort((a, b) => a.due.localeCompare(b.due));
  }

  addAssignment(a: Assignment) {
    this.db.assignments.push(a);
    this.save();
    return a;
  }

  deleteAssignment(id: string) {
    const before = this.db.assignments.length;
    this.db.assignments = this.db.assignments.filter((a) => a.id !== id);
    if (this.db.assignments.length === before) return false;
    this.save();
    return true;
  }

  // ---- guitars ----------------------------------------------------------------------------

  listGuitars() {
    return Object.values(this.db.guitars).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }

  getGuitar(id: string) {
    return this.db.guitars[id];
  }

  putGuitar(profile: GuitarProfile) {
    this.db.guitars[profile.id] = profile;
    this.save();
    return profile;
  }

  deleteGuitar(id: string) {
    if (!this.db.guitars[id]) return false;
    delete this.db.guitars[id];
    fs.rmSync(this.guitarDir(id), { recursive: true, force: true });
    if (this.db.settings.activeGuitarId === id) this.db.settings.activeGuitarId = BUILTIN_GUITAR_ID;
    this.save();
    return true;
  }

  guitarDir(id: string) {
    return path.join(this.guitarsDir, id);
  }

  // ---- settings ---------------------------------------------------------------------------

  getSettings(): AppSettings {
    return { ...this.db.settings };
  }

  putSettings(s: AppSettings) {
    this.db.settings = { ...this.db.settings, ...s };
    this.save();
    return this.getSettings();
  }
}
