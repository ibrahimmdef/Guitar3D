import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

/** A small pill while the browser is offline: built-in lessons, tools and cached tabs keep working. */
export function OfflineIndicator() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-pill" role="status" aria-live="polite">
      <WifiOff size={14} aria-hidden />
      <span>Çevrimdışı: dersler, araçlar ve önbellekteki tablar çalışır</span>
    </div>
  );
}
