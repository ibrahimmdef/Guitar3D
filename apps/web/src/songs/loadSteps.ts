import type { Song, TranscriptionJob } from '@guitar3d/shared';
import type { LoadStep } from '../ui/LoadingProgress';

/** Steps of preparing an audio song: queue, download (link songs only), instrument separation. */
export function separationSteps(song: Pick<Song, 'status' | 'progress' | 'sourceUrl'>): LoadStep[] {
  const order = ['queued', 'downloading', 'separating', 'ready'] as const;
  const at = order.indexOf(song.status as (typeof order)[number]);
  const step = (status: (typeof order)[number]) => {
    const i = order.indexOf(status);
    return at > i ? 1 : at === i ? song.progress : 0;
  };
  return [
    { label: 'Waiting in the queue', progress: at > 0 ? 1 : 0, weight: 0.3 },
    ...(song.sourceUrl ? [{ label: 'Downloading the audio', progress: step('downloading'), weight: 1 }] : []),
    { label: 'Splitting the instruments', progress: step('separating'), weight: 4 },
  ];
}

/**
 * Steps of turning audio into tab: upload (recordings only: `upload` is then 'running' or 'done'),
 * queue, transcription.
 */
export function transcriptionSteps(job: Pick<TranscriptionJob, 'status' | 'progress'> | null, upload?: 'running' | 'done'): LoadStep[] {
  const steps: LoadStep[] = [];
  if (upload) steps.push({ label: 'Uploading', progress: upload === 'done' ? 1 : 0.5, weight: 0.5 });
  steps.push({ label: 'Waiting in the queue', progress: job && job.status !== 'queued' ? 1 : 0, weight: 0.3 });
  steps.push({ label: 'Transcribing', progress: !job ? 0 : job.status === 'ready' ? 1 : job.status === 'running' ? job.progress : 0, weight: 3 });
  return steps;
}
