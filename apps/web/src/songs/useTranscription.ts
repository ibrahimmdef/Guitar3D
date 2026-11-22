import { useEffect, useState } from 'react';
import type { TranscriptionJob } from '@guitar3d/shared';
import { getTranscription } from '../screens/data';

export const isActiveJob = (j: TranscriptionJob | null | undefined) => !!j && (j.status === 'queued' || j.status === 'running');

/** Follows a transcription job (polls while it is queued or running). */
export function useTranscriptionJob(initial: TranscriptionJob | null): [TranscriptionJob | null, (j: TranscriptionJob | null) => void] {
  const [job, setJob] = useState<TranscriptionJob | null>(initial);
  const id = job?.id;
  const active = isActiveJob(job);
  useEffect(() => {
    if (!id || !active) return;
    let stop = false;
    let timer = 0;
    const tick = () =>
      getTranscription(id)
        .then((j) => {
          if (stop) return;
          setJob(j);
          if (isActiveJob(j)) timer = window.setTimeout(tick, 1500);
        })
        .catch(() => !stop && (timer = window.setTimeout(tick, 4000)));
    timer = window.setTimeout(tick, 1000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id, active]);
  return [job, setJob];
}

/** "Transcribing… 42%" / "Waiting in the queue…" for a running job. */
export function jobProgressLabel(j: TranscriptionJob): string {
  return j.status === 'queued' ? 'Waiting in the queue…' : `Transcribing… ${Math.round(j.progress * 100)}%`;
}
