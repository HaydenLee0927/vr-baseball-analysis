import { useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ko } from '../i18n/ko';
import { searchPlayers } from '../lib/search';
import type { PlayerIndexRow } from '../lib/types';
import { useData } from '../lib/useData';

export function SearchBox() {
  const { data } = useData<PlayerIndexRow[]>('players.json');
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const listId = useId();
  const results = useMemo(() => (data ? searchPlayers(data, q).slice(0, 8) : []), [data, q]);

  return (
    <div className="search">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={ko.search.placeholder}
        aria-label={ko.search.label}
        aria-controls={listId}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) {
            navigate(`/player/${results[0].slug}`);
            setQ('');
          }
        }}
      />
      {q.trim() && (
        <ul className="search-results" id={listId}>
          {results.length === 0 && <li className="muted">{ko.search.noResults}</li>}
          {results.map((p) => (
            <li key={p.id}>
              <Link to={`/player/${p.slug}`} onClick={() => setQ('')}>
                {p.name}
                {p.vrchat_name !== p.name && <span className="muted"> · {p.vrchat_name}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
