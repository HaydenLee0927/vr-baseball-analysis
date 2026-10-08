import { Link } from 'react-router-dom';
import { SearchBox } from '../components/SearchBox';
import { ko } from '../i18n/ko';
import { teamName } from '../lib/display';
import { formatDate, formatDateTime, formatStat } from '../lib/format';
import type { GameSummary, Meta, Team } from '../lib/types';
import { useData } from '../lib/useData';

export function Home() {
  const meta = useData<Meta>('meta.json');
  const games = useData<GameSummary[]>('games.json').data;
  const teams = useData<Team[]>('teams.json').data;

  const charted = (games ?? [])
    .filter((g) => g.pitches > 0)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.game_id.localeCompare(a.game_id));

  return (
    <main className="page">
      <h1>{ko.home.title}</h1>
      <div className="home-search">
        <SearchBox />
      </div>
      <p className="row">
        <Link className="button" to="/leaderboard">{ko.home.hitters} {ko.home.leaderboards}</Link>
        <Link className="button" to="/leaderboard?role=pitching">{ko.home.pitchers} {ko.home.leaderboards}</Link>
      </p>

      {meta.error && <p className="error">{ko.gate.loadError}</p>}
      {meta.data && (
        <>
          <p>{ko.home.coverage(meta.data.coverage.games, formatStat(meta.data.coverage.pitches, 'int'))}</p>
          <p className="muted small">{ko.home.coverageNote}</p>
        </>
      )}

      <h2>{ko.home.recentGames}</h2>
      <ul className="games">
        {charted.map((g) => (
          <li key={g.game_id}>
            <span className="game-label">
              {g.date ? formatDate(g.date) : ''} {g.label}
            </span>
            <span>
              {teamName(teams, g.away_team_id)} {g.away_score ?? ''} : {g.home_score ?? ''} {teamName(teams, g.home_team_id)}
            </span>
            {g.chart_status === 'partial' && <span className="chip">{ko.home.partial}</span>}
          </li>
        ))}
      </ul>

      {meta.data && (
        <p className="muted small">
          {ko.home.builtAt}: {formatDateTime(meta.data.built_at)}
        </p>
      )}
    </main>
  );
}
