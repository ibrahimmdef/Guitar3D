import fs from 'node:fs';
import path from 'node:path';
import type { TabMeta, TabProgress } from '@guitar3d/shared';

interface DbShape {
  tabs: TabMeta[];
  progress: Record<string, TabProgress>;
}

export class Store {
  readonly tabsDir: string;
  private readonly dbFile: string;
  private db: DbShape;

  constructor(readonly dataDir: string) {
    this.tabsDir = path.join(dataDir, 'tabs');
    this.dbFile = path.join(dataDir, 'db.json');
    fs.mkdirSync(this.tabsDir, { recursive: true });
    this.db = fs.existsSync(this.dbFile)
      ? (JSON.parse(fs.readFileSync(this.dbFile, 'utf8')) as DbShape)
      : { tabs: [], progress: {} };
  }

  private save() {
    const tmp = `${this.dbFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.dbFile);
  }

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

  deleteTab(id: string) {
    const tab = this.getTab(id);
    if (!tab) return false;
    this.db.tabs = this.db.tabs.filter((t) => t.id !== id);
    delete this.db.progress[id];
    fs.rmSync(path.join(this.tabsDir, tab.fileName), { force: true });
    this.save();
    return true;
  }

  getProgress(tabId: string): TabProgress {
    return this.db.progress[tabId] ?? { tabId, sections: [] };
  }

  putProgress(p: TabProgress) {
    this.db.progress[p.tabId] = p;
    this.save();
    return p;
  }
}
