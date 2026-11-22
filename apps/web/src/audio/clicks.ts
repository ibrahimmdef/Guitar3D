/** The shared Web Audio context used by the backing track (scales screen). */

let shared: AudioContext | null = null;

export function audioContext(): AudioContext | null {
  if (shared) return shared;
  const AC: typeof AudioContext | undefined = typeof window === 'undefined'
    ? undefined
    : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  shared = new AC();
  return shared;
}

/** Resumes the shared context (must be called from a user gesture on most browsers). */
export async function unlockAudio(): Promise<AudioContext | null> {
  const ctx = audioContext();
  if (ctx && ctx.state !== 'running') await ctx.resume().catch(() => {});
  return ctx;
}
