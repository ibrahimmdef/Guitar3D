import { describe, expect, it } from 'vitest';
import { overallProgress } from '../ui/LoadingProgress';
import { separationSteps, transcriptionSteps } from './loadSteps';

describe('separationSteps', () => {
  it('adds a download step only for songs from a link', () => {
    expect(separationSteps({ status: 'queued', progress: 0 }).map((s) => s.label)).toEqual(['Waiting in the queue', 'Splitting the instruments']);
    expect(separationSteps({ status: 'queued', progress: 0, sourceUrl: 'https://x' })).toHaveLength(3);
  });

  it('fills the steps in order and reaches 100 % when ready', () => {
    const link = { sourceUrl: 'https://x' };
    const dl = separationSteps({ ...link, status: 'downloading', progress: 0.5 });
    expect(dl.map((s) => s.progress)).toEqual([1, 0.5, 0]);
    const sep = separationSteps({ ...link, status: 'separating', progress: 0.25 });
    expect(sep.map((s) => s.progress)).toEqual([1, 1, 0.25]);
    expect(overallProgress(sep)).toBeGreaterThan(overallProgress(dl));
    expect(overallProgress(separationSteps({ ...link, status: 'ready', progress: 1 }))).toBe(1);
  });
});

describe('transcriptionSteps', () => {
  it('shows the upload only for recordings', () => {
    expect(transcriptionSteps(null)[0].label).toBe('Waiting in the queue');
    expect(transcriptionSteps(null, 'running')[0]).toMatchObject({ label: 'Uploading', progress: 0.5 });
  });

  it('follows the job', () => {
    expect(transcriptionSteps({ status: 'queued', progress: 0 }).map((s) => s.progress)).toEqual([0, 0]);
    expect(transcriptionSteps({ status: 'running', progress: 0.4 }).map((s) => s.progress)).toEqual([1, 0.4]);
    expect(overallProgress(transcriptionSteps({ status: 'ready', progress: 1 }, 'done'))).toBe(1);
  });
});
