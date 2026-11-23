import type { TabFormat, TabMeta } from '@guitar3d/shared';
import * as library from '../storage/library';

export type { TabSort } from '../storage/library';

/** The tab library (storage/library.ts) as the screens use it. */
export const tabsApi = {
  list: (q?: { q?: string; sort?: library.TabSort }) => library.listTabs(q),
  uploadFile: async (file: Blob, name: string, meta: { title?: string; artist?: string; format?: TabFormat } = {}) =>
    library.addTabFile(await file.arrayBuffer(), name, meta),
  uploadAlphaTex: (alphaTex: string, meta: { title?: string; artist?: string; format?: 'alphatex' | 'ascii' } = {}) => library.addTabText(alphaTex, meta),
  rename: (id: string, patch: { title?: string; artist?: string }) => library.renameTab(id, patch),
  markPlayed: (id: string) => library.markTabPlayed(id),
  remove: (id: string) => library.deleteTab(id),
  /** Raw file bytes; alphaTex tabs (format 'alphatex' | 'ascii') should be decoded as text and fed to `api.tex()`. */
  file: (id: string) => library.tabFile(id),
};

/** True when the stored file is alphaTex text (load with `AlphaTabApi.tex`), not a binary score. */
export const isTextTab = (t: Pick<TabMeta, 'format' | 'fileName'>) => t.format === 'alphatex' || t.format === 'ascii' || t.fileName.endsWith('.atex');
