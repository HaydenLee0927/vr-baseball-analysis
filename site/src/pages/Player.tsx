import { useParams, useSearchParams } from 'react-router-dom';
import { StatTable } from '../components/StatTable';
import { ko } from '../i18n/ko';
import { formatDate, formatStat } from '../lib/format';
import { handsLabel, seasonOrder, teamName } from '../lib/display';
import {
  HITTING_BATTED_BALL,
  HITTING_DISCIPLINE,
  HITTING_GAME_LOG,
  HITTING_STANDARD,
  PITCHING_GAME_LOG,
  PITCHING_STANDARD,
  PITCHING_STUFF,
  splitColumns,
  type StatCol,
} from '../lib/stats';
import type { GameLogRow, GameSummary, Line, PlayerFile, Role, SeasonLine, Team } from '../lib/types';
import { useData } from '../lib/useData';

export function Player() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const file = useData<PlayerFile>(slug ? `player/${slug}.json` : null);
  const games = useData<GameSummary[]>('games.json').data;
  const teams = useData<Team[]>('teams.json').data;

  if (file.error) return <main className="page"><p>{ko.common.notFound}</p></main>;
  if (!file.data) return <main className="page"><p className="muted">{ko.common.loading}</p></main>;

  const { player, game_log } = file.data;
  const order = seasonOrder(file.data.seasons.map((s) => s.season), games);
  const seasons = order.map((s) => file.data!.seasons.find((x) => x.season === s)!);
  const current = seasons.find((s) => s.season === params.get('season')) ?? seasons[0];
  const bats = seasons.some((s) => s.batting);
  const pitches = seasons.some((s) => s.pitching);
  const total = (role: Role, key: string) => seasons.reduce((n, s) => n + Number(s[role]?.[key] ?? 0), 0);

  // One row per season for the season tables (most recent first).
  const seasonRows = (role: Role) =>
    seasons
      .filter((s) => s[role])
      .map((s) => ({ key: s.season, line: s[role]!, lead: [s.season, s.team_ids.map((t) => teamName(teams, t)).join(', ')] }));
  const seasonTable = (role: Role, cols: StatCol[], title: string) => (
    <>
      <h3>{title}</h3>
      <StatTable role={role} season={current.season} cols={cols} rows={seasonRows(role)} leadHeaders={[ko.player.season, ko.player.team]} />
    </>
  );

  const logRows = (role: Role, rows: GameLogRow[]) =>
    rows
      .filter((g) => g.season === current.season)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .map((g) => {
        const lead = [g.date ? formatDate(g.date) : (g.label ?? g.game_id), teamName(teams, g.opponent)];
        if (role === 'batting') lead.push(((g.results as string[]) ?? []).map((r) => ko.paResults[r] ?? r).join(', '));
        return { key: g.game_id, line: g as unknown as Line, lead };
      });

  const splitRows = (s: SeasonLine, role: Role) =>
    s.splits[role].map((sp) => ({ key: sp.key, line: sp, lead: [ko.splits[sp.key] ?? sp.key] }));

  return (
    <main className="page">
      <header className="player-head">
        <h1>{player.name}</h1>
        <p className="muted">
          {player.vrchat_name !== player.name && (
            <>
              {ko.player.vrchat}: {player.vrchat_name} ·{' '}
            </>
          )}
          {[...new Set(seasons.flatMap((s) => s.team_ids))].map((t) => teamName(teams, t)).join(', ')}
          {handsLabel(player.throws, player.bats, pitches, bats) && <> · {handsLabel(player.throws, player.bats, pitches, bats)}</>}
        </p>
        <p className="chips">
          {bats && <span className="chip">{ko.player.sample.batting(formatStat(total('batting', 'pa'), 'int'))}</span>}
          {pitches && <span className="chip">{ko.player.sample.pitching(formatStat(total('pitching', 'bf'), 'int'))}</span>}
        </p>
      </header>

      {bats && (
        <section>
          <h2>{ko.player.batting}</h2>
          {seasonTable('batting', HITTING_STANDARD, ko.player.standard)}
          {seasonTable('batting', HITTING_DISCIPLINE, ko.player.discipline)}
          {seasonTable('batting', HITTING_BATTED_BALL, ko.player.battedBall)}
        </section>
      )}
      {pitches && (
        <section>
          <h2>{ko.player.pitching}</h2>
          {seasonTable('pitching', PITCHING_STANDARD, ko.player.standard)}
          {seasonTable('pitching', PITCHING_STUFF, ko.player.stuff)}
        </section>
      )}

      {seasons.length > 1 && (
        <label className="season-pick">
          {ko.player.season}{' '}
          <select
            value={current.season}
            onChange={(e) => setParams(new URLSearchParams({ season: e.target.value }), { replace: true })}
          >
            {seasons.map((s) => (
              <option key={s.season} value={s.season}>{s.season}</option>
            ))}
          </select>
        </label>
      )}

      <section>
        <h2>
          {ko.player.splits} <span className="muted small">{current.season}</span>
        </h2>
        <p className="muted small">{ko.player.splitsNote}</p>
        {(['batting', 'pitching'] as Role[])
          .filter((r) => current.splits[r].length)
          .map((r) => (
            <div key={r}>
              <h3>{r === 'batting' ? ko.player.batting : ko.player.pitching}</h3>
              <StatTable role={r} season={current.season} cols={splitColumns(r)} rows={splitRows(current, r)} leadHeaders={[ko.player.split]} />
            </div>
          ))}
      </section>

      <section>
        <h2>
          {ko.player.gameLog} <span className="muted small">{current.season}</span>
        </h2>
        {current.batting && (
          <>
            <h3>{ko.player.batting}</h3>
            <StatTable
              role="batting"
              season={current.season}
              cols={HITTING_GAME_LOG}
              rows={logRows('batting', game_log.batting)}
              leadHeaders={[ko.player.game, ko.player.opponent, ko.player.results]}
            />
          </>
        )}
        {current.pitching && (
          <>
            <h3>{ko.player.pitching}</h3>
            <StatTable
              role="pitching"
              season={current.season}
              cols={PITCHING_GAME_LOG}
              rows={logRows('pitching', game_log.pitching)}
              leadHeaders={[ko.player.game, ko.player.opponent]}
            />
          </>
        )}
      </section>
    </main>
  );
}
