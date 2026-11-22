/**
 * One heavy job at a time: stem separation (Demucs) and transcription (Basic Pitch) each need a lot
 * of RAM and CPU, so both queues run their work through the same lock.
 */
export class JobLock {
  private tail: Promise<void> = Promise.resolve();

  /** Runs `fn` after every job queued before it has finished. */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
