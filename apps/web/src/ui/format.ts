/** m:ss, clamped at zero. */
export function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Turkish percent notation: 0.75 → "%75". */
export function formatPercent(v: number): string {
  return `%${Math.round(v * 100)}`;
}

const rtf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' });

/** "az önce", "3 dakika önce", "dün" … or a short date after 30 days. */
export function relativeTime(iso: string | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = (t - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'az önce';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}
