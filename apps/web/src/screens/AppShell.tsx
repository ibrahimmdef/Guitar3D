import type { ReactNode } from 'react';
import { Activity, Drum, Gauge, Grid3x3, Guitar, Library, ListChecks, Music2, Repeat, Settings, Target } from 'lucide-react';
import { routeHref, type Route, type SimpleRouteName } from '../ui/router';

export interface NavEntry { route: SimpleRouteName; label: string; icon: ReactNode }
export interface NavGroup { label: string; items: NavEntry[] }

/** Left navigation, grouped. On phones the first PRIMARY entries form the bottom bar. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Çal',
    items: [
      { route: 'library', label: 'Kütüphane', icon: <Library size={18} /> },
      { route: 'rhythm', label: 'Ritim', icon: <Drum size={18} /> },
      { route: 'routines', label: 'Rutinler', icon: <ListChecks size={18} /> },
      { route: 'progress', label: 'İlerleme', icon: <Activity size={18} /> },
    ],
  },
  {
    label: 'Öğren',
    items: [
      { route: 'chords', label: 'Akorlar', icon: <Grid3x3 size={18} /> },
      { route: 'scales', label: 'Gamlar', icon: <Music2 size={18} /> },
      { route: 'fretboard-game', label: 'Sap oyunu', icon: <Target size={18} /> },
      { route: 'chord-trainer', label: 'Akor geçişi', icon: <Repeat size={18} /> },
    ],
  },
  {
    label: 'Araçlar',
    items: [
      { route: 'tuner', label: 'Akort', icon: <Gauge size={18} /> },
      { route: 'guitar', label: 'Gitarım', icon: <Guitar size={18} /> },
      { route: 'settings', label: 'Ayarlar', icon: <Settings size={18} /> },
    ],
  },
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
        {NAV_GROUPS.map((g) => (
          <div className="nav-group" key={g.label}>
            <h2 className="nav-group-label">{g.label}</h2>
            <ul className="nav-list">
              {g.items.map((n) => {
                const active = n.route === route.name;
                return (
                  <li key={n.route}>
                    <a className={`nav-item${active ? ' active' : ''}`} href={routeHref({ name: n.route })} aria-current={active ? 'page' : undefined}>
                      <span aria-hidden className="nav-ic">{n.icon}</span>
                      <span>{n.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
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
