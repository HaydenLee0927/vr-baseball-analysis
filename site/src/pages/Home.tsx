import { useEffect, useState } from 'react';
import { ko } from '../i18n/ko';
import { loadData } from '../lib/loadData';

type Meta = { built_at: string; fixture: boolean };

export function Home() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadData<Meta>('meta.json').then(setMeta, () => setFailed(true));
  }, []);

  return (
    <main className="page">
      <h1>{ko.home.title}</h1>
      <p>{ko.home.placeholder}</p>
      {failed && <p className="error">{ko.gate.loadError}</p>}
      {meta && (
        <p className="muted">
          {ko.home.builtAt}: {new Date(meta.built_at).toLocaleString('ko-KR')}
          {meta.fixture && ` · ${ko.home.fixtureNotice}`}
        </p>
      )}
    </main>
  );
}
