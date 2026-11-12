import { Fragment } from 'react';
import { Kbd } from './kit';
import { SHORTCUTS } from './shortcuts';

export function ShortcutList() {
  return (
    <div className="shortcut-groups">
      {SHORTCUTS.map((g) => (
        <section key={g.group}>
          <h3 className="eyebrow">{g.group}</h3>
          <dl className="shortcut-list">
            {g.items.map((s) => (
              <div key={s.label} className="shortcut-row">
                <dt>{s.label}</dt>
                <dd>
                  {s.keys.map((k, i) => (
                    <Fragment key={k}>
                      {i > 0 && <span className="subtle"> / </span>}
                      <Kbd>{k}</Kbd>
                    </Fragment>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
