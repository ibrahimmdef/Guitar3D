import type { TabMeta, TabProgress } from '@guitar3d/shared';
import * as library from '../storage/library';

/**
 * Screen-level data access for tabs and progress (stored in this browser, see storage/library.ts).
 * Guitars live in guitar-setup/api.ts (guitarsApi) and guitar-setup/activeGuitar.ts (useActiveGuitar).
 */

export const listTabs = () => library.listTabs();

export const fetchTabFile = (id: string) => library.tabFile(id);

export const deleteTab = (id: string) => library.deleteTab(id);

/** Adds a file to the library; Guitar Pro files are binary, so title / artist are read here with alphaTab. */
export async function uploadTab(file: File): Promise<TabMeta> {
  const data = await file.arrayBuffer();
  const meta: { title?: string; artist?: string } = {};
  if (/\.(gp|gp3|gp4|gp5|gpx|gp7)$/i.test(file.name)) {
    try {
      const { importer, Settings } = await import('@coderline/alphatab');
      const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(data), new Settings());
      meta.title = score.title.trim() || undefined;
      meta.artist = score.artist.trim() || undefined;
    } catch {
      /* unreadable here: the file name is the title, the player shows the error */
    }
  }
  return library.addTabFile(data, file.name, meta);
}

export const getProgress = (id: string) => library.getProgress(id);

export const listAllProgress = () => library.listProgress();

/** One speed-trainer pass (keeps the history and the best clean speed of the section). */
export const recordPass = (tabKey: string, body: library.PassInput) => library.recordPass(tabKey, body);

/** Best clean speed across practised sections, or null when never practised. */
export function bestSpeed(p: TabProgress | undefined): number | null {
  if (!p || p.sections.length === 0) return null;
  return Math.max(...p.sections.map((s) => s.bestCleanSpeed));
}
