import { useState, type ReactNode } from 'react';
import { Activity, Gauge, Grid3x3, Guitar, Library, Menu, Music2, PencilLine, Settings } from 'lucide-react';
import { Sheet } from '../ui/kit';
import { routeHref, type Route, type SimpleRouteName } from '../ui/router';

export interface NavEntry { route: SimpleRouteName; label: string; icon: ReactNode }
export interface NavGroup { label: string; items: NavEntry[] }

/** Left navigation, grouped. On phones the first PRIMARY entries form the bottom bar. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Play',
    items: [
      { route: 'library', label: 'Library', icon: <Library size={18} /> },
      { route: 'progress', label: 'Progress', icon: <Activity size={18} /> },
    ],
  },
  {
    label: 'Learn',
    items: [
      { route: 'chords', label: 'Chords', icon: <Grid3x3 size={18} /> },
      { route: 'scales', label: 'Scales', icon: <Music2 size={18} /> },
    ],
  },
  {
    label: 'Tools',
    items: [
      { route: 'tuner', label: 'Tuner', icon: <Gauge size={18} /> },
      { route: 'editor', label: 'Tab editor', icon: <PencilLine size={18} /> },
      { route: 'guitar', label: 'My guitars', icon: <Guitar size={18} /> },
      { route: 'settings', label: 'Settings', icon: <Settings size={18} /> },
    ],
  },
];

/** Nav entry a route belongs to. */
const navOf = (route: Route) => route.name;

/** Shell for the non-player screens: sidebar on wide screens, bottom tab bar on phones. */
export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  return (
    <div className="shell">
      <nav className="shell-nav" aria-label="Main menu">
        <a className="brand" href={routeHref({ name: 'library' })} aria-label="Guitar3D, library">
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
                const active = n.route === navOf(route);
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
      <BottomNav route={route} />
    </div>
  );
}

/** Phone tab bar: the most used destinations plus a "Menu" sheet with every screen, grouped. */
export const PRIMARY: SimpleRouteName[] = ['library', 'chords', 'tuner', 'progress'];

function BottomNav({ route }: { route: Route }) {
  const [open, setOpen] = useState(false);
  const all = NAV_GROUPS.flatMap((g) => g.items);
  const primary = PRIMARY.map((r) => all.find((n) => n.route === r)!);
  const inMenu = !PRIMARY.includes(navOf(route) as SimpleRouteName);
  return (
    <nav className="bottom-nav" aria-label="Bottom menu">
      {primary.map((n) => {
        const active = n.route === navOf(route);
        return (
          <a key={n.route} className={`bn-item${active ? ' active' : ''}`} href={routeHref({ name: n.route })} aria-current={active ? 'page' : undefined}>
            <span aria-hidden className="nav-ic">{n.icon}</span>
            <span>{n.label}</span>
          </a>
        );
      })}
      <button type="button" className={`bn-item${inMenu ? ' active' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span aria-hidden className="nav-ic"><Menu size={18} /></span>
        <span>Menu</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="All screens">
        <div className="bn-sheet">
          {NAV_GROUPS.map((g) => (
            <section key={g.label}>
              <h2 className="nav-group-label">{g.label}</h2>
              <ul className="bn-grid">
                {g.items.map((n) => (
                  <li key={n.route}>
                    <a className={`bn-tile${n.route === route.name ? ' active' : ''}`} href={routeHref({ name: n.route })} onClick={() => setOpen(false)} aria-current={n.route === route.name ? 'page' : undefined}>
                      <span aria-hidden className="nav-ic">{n.icon}</span>
                      <span>{n.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Sheet>
    </nav>
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
