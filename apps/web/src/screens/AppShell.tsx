import type { ReactNode } from 'react';
import { Grid3x3, Guitar, Library, Music2, Settings } from 'lucide-react';
import { routeHref, type Route } from '../ui/router';

const NAV: { route: Route; label: string; icon: ReactNode }[] = [
  { route: { name: 'library' }, label: 'Kütüphane', icon: <Library size={18} /> },
  { route: { name: 'chords' }, label: 'Akorlar', icon: <Grid3x3 size={18} /> },
  { route: { name: 'scales' }, label: 'Gamlar', icon: <Music2 size={18} /> },
  { route: { name: 'guitar' }, label: 'Gitarım', icon: <Guitar size={18} /> },
  { route: { name: 'settings' }, label: 'Ayarlar', icon: <Settings size={18} /> },
];

/** Shell for the non-player screens: sidebar on wide screens, bottom tab bar on phones. */
export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  return (
    <div className="shell">
      <nav className="shell-nav" aria-label="Ana menü">
        <a className="brand" href={routeHref({ name: 'library' })} aria-label="Guitar3D, kütüphane">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="4" fill="currentColor" />
            </svg>
          </span>
          <span className="brand-name">Guitar3D</span>
        </a>
        <ul className="nav-list">
          {NAV.map((n) => {
            const active = n.route.name === route.name;
            return (
              <li key={n.route.name}>
                <a className={`nav-item${active ? ' active' : ''}`} href={routeHref(n.route)} aria-current={active ? 'page' : undefined}>
                  <span aria-hidden className="nav-ic">{n.icon}</span>
                  <span>{n.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <main className="shell-main">{children}</main>
    </div>
  );
}

export function ScreenHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="screen-head">
      <div>
        <h1>{title}</h1>
        {description && <p className="screen-desc">{description}</p>}
      </div>
      {actions && <div className="screen-actions">{actions}</div>}
    </header>
  );
}
