import { CircleExclamationPoint, CircleCheck, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastTone = 'info' | 'success' | 'danger';
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}
type Push = (t: { title: string; description?: string; tone?: ToastTone; durationMs?: number }) => void;

const Ctx = createContext<Push>(() => {});

export const useToast = () => useContext(Ctx);

const ICON = { info: Info, success: CircleCheck, danger: CircleExclamationPoint };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((x) => x.filter((t) => t.id !== id)), []);
  const push = useCallback<Push>(({ title, description, tone = 'info', durationMs = 4000 }) => {
    const id = ++seq.current;
    setItems((x) => [...x.slice(-2), { id, title, description, tone }]);
    window.setTimeout(() => dismiss(id), durationMs);
  }, [dismiss]);
  const value = useMemo(() => push, [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div key={t.id} className={`toast toast-${t.tone}`}>
              <Icon size={18} aria-hidden className="toast-ic" />
              <div className="toast-text">
                <div className="toast-title">{t.title}</div>
                {t.description && <div className="toast-desc">{t.description}</div>}
              </div>
              <button className="toast-x" aria-label="Bildirimi kapat" onClick={() => dismiss(t.id)}><X size={16} /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
