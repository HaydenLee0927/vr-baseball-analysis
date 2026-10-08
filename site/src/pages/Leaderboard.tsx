import { Link, useSearchParams } from 'react-router-dom';
import { StatTable } from '../components/StatTable';
import { ko } from '../i18n/ko';
import { seasonOrder, teamName } from '../lib/display';
import { HITTING_LEADERBOARD, PITCHING_LEADERBOARD } from '../lib/stats';
import type { GameSummary, Meta, PlayerIndexRow, Role, Team } from '../lib/types';
import { useData } from '../lib/useData';

// Default minimum sample; samples are small, so the bar is low and "전체 보기" is one click away.
const DEFAULT_MIN: Record<Role, number> = { batting: 5, pitching: 10 };

export function Leaderboard() {
  const [params, setParams] = useSearchParams();
  const players = useData<PlayerIndexRow[]>('players.json');
  const games = useData<GameSummary[]>('games.json').data;
  const teams = useData<Team[]>('teams.json').data;
  const meta = useData<Meta>('meta.json').data;

  if (players.error) return <main className="page"><p className="error">{ko.gate.loadError}</p></main>;
  if (!players.data || !meta) return <main className="page"><p className="muted">{ko.common.loading}</p></main>;

  const role: Role = params.get('role') === 'pitching' ? 'pitching' : 'batting';
  const seasons = seasonOrder(meta.seasons, games);
  const season = params.get('season') ?? seasons[0];
  const team = params.get('team') ?? '';
  const showAll = params.get('all') === '1';
  const min = Number(params.get('min') ?? DEFAULT_MIN[role]);
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null || v === '') next.delete(k);
    else next.set(k, v);
    if (k === 'role') next.delete('min');
    setParams(next, { replace: true });
  };

  const sample = (p: PlayerIndexRow) => Number((role === 'batting' ? p.batting?.pa : p.pitching?.bf) ?? 0);
  const seasonTeams = [...new Set(players.data.filter((p) => p.season === season).flatMap((p) => p.team_ids))].sort();
  const rows = players.data
    .filter((p) => p.season === season && p[role] && (!team || p.team_ids.includes(team)) && (showAll || sample(p) >= min))
    .map((p) => {
      const teamLabel = p.team_ids.map((t) => teamName(teams, t)).join(', ');
      return {
        key: p.id,
        line: p[role]!,
        lead: [<Link to={`/player/${p.slug}`}>{p.name}</Link>, teamLabel],
        leadSort: [p.name, teamLabel],
      };
    });

  return (
    <main className="page">
      <h1>{ko.leaderboard.title}</h1>
      <div className="tabs" role="tablist">
        {(['batting', 'pitching'] as Role[]).map((r) => (
          <button key={r} type="button" role="tab" aria-selected={role === r} className={role === r ? 'on' : ''} onClick={() => set('role', r)}>
            {r === 'batting' ? ko.leaderboard.hitters : ko.leaderboard.pitchers}
          </button>
        ))}
      </div>
      <div className="filters">
        <label>
          {ko.leaderboard.season}
          <select value={season} onChange={(e) => set('season', e.target.value)}>
            {seasons.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          {ko.leaderboard.team}
          <select value={team} onChange={(e) => set('team', e.target.value)}>
            <option value="">{ko.leaderboard.allTeams}</option>
            {seasonTeams.map((t) => (
              <option key={t} value={t}>{teamName(teams, t)}</option>
            ))}
          </select>
        </label>
        <label>
          {ko.leaderboard.minSample[role]}
          <input type="number" min={0} value={min} disabled={showAll} onChange={(e) => set('min', e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={showAll} onChange={(e) => set('all', e.target.checked ? '1' : null)} />
          {ko.leaderboard.showAll}
        </label>
      </div>
      <p className="muted small">
        {ko.leaderboard.count(rows.length)} · {ko.leaderboard.sortHint}
      </p>
      {rows.length === 0 ? (
        <p className="muted">{ko.common.none}</p>
      ) : (
        <StatTable
          key={role}
          role={role}
          season={season}
          cols={role === 'batting' ? HITTING_LEADERBOARD : PITCHING_LEADERBOARD}
          leadHeaders={[ko.leaderboard.player, ko.leaderboard.team]}
          rows={rows}
          sortBy={role === 'batting' ? 'ops' : 'ip'}
        />
      )}
    </main>
  );
}
