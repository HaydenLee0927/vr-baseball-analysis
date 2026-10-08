import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { glossary, pick } from '../i18n/glossary.ko';
import { ko } from '../i18n/ko';
import { ALL_COLUMNS, glossaryId } from '../lib/stats';
import type { Role } from '../lib/types';

/** Generated from glossary.ko.ts, the same source as the "?" popovers. */
export function Glossary() {
  const [params] = useSearchParams();
  const focus = params.get('stat');
  const focusRole = params.get('role') === 'pitching' ? 'pitching' : 'batting';

  useEffect(() => {
    if (focus) document.getElementById(`stat-${focusRole}-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [focus, focusRole]);

  const section = (role: Role, title: string) => {
    const ids = [...new Set(ALL_COLUMNS.find((c) => c.role === role)!.cols.map(glossaryId))];
    return (
      <section>
        <h2>{title}</h2>
        <dl className="glossary">
          {ids.map((id) => {
            const e = glossary[id];
            return (
              <div key={id} id={`stat-${role}-${id}`} className={focus === id && focusRole === role ? 'focus' : ''}>
                <dt>{pick(e.name, role)}</dt>
                <dd>
                  <p>{pick(e.what, role)}</p>
                  <p><b>{ko.help.readTitle}</b> {pick(e.read, role)}</p>
                  <p><b>{ko.help.useTitle}</b> {pick(e.use, role)}</p>
                </dd>
              </div>
            );
          })}
        </dl>
      </section>
    );
  };

  return (
    <main className="page">
      <h1>{ko.glossaryPage.title}</h1>
      <p className="muted">{ko.glossaryPage.intro}</p>
      {section('batting', ko.glossaryPage.hitters)}
      {section('pitching', ko.glossaryPage.pitchers)}
    </main>
  );
}
