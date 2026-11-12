import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from './Button';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Shortcut that toggles the drawer, shown in the close tooltip. */
  shortcut?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Non-modal side panel. On wide screens it sits beside the content (the parent grid reserves
 * the column); on narrow screens it floats over the content.
 */
export function Drawer({ open, onClose, title, shortcut, children, className }: Props) {
  return (
    <aside className={`drawer${open ? ' open' : ''}${className ? ` ${className}` : ''}`} aria-label={title} aria-hidden={!open} inert={!open}>
      <header className="drawer-head">
        <h2 className="drawer-title">{title}</h2>
        <IconButton label="Paneli kapat" shortcut={shortcut} icon={<X size={18} />} onClick={onClose} />
      </header>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}
