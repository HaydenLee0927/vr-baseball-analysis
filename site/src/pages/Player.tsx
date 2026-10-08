import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { PercentileBars } from '../components/charts/PercentileBars';
import { SprayChart } from '../components/charts/SprayChart';
import { VeloChart } from '../components/charts/VeloChart';
import { ZoneChart } from '../components/charts/ZoneChart';
import { StatTable } from '../components/StatTable';
import { ko } from '../i18n/ko';
import { applyFilter, NO_FILTER, type ChartFilter } from '../lib/charts';
import { handsLabel, seasonOrder, teamName } from '../lib/display';
import { formatDate, formatStat } from '../lib/format';
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
  const [filter, setFilter] = useState<ChartFilter>(NO_FILTER);
  const file = useData<PlayerFile>(slug ? `player/${slug}.json` : null);
  const games = useData<GameSummary[]>('games.json').data;
  const teams = useData<Team[]>('teams.json').data;

  if (file.error) return <main className="page"><p>{ko.common.notFound}</p></main>;
  if (!file.data) return <main className="page"><p className="muted">{ko.common.loading}</p></main>;

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const { player, game_log, pitches } = file.data;
  const order = seasonOrder(file.data.seasons.map((s) => s.season), games);
  const seasons = order.map((s) => file.data!.seasons.find((x) => x.season === s)!);
  const current = seasons.find((s) => s.season === params.get('season')) ?? seasons[0];
  const bats = seasons.some((s) => s.batting);
  const throws = seasons.some((s) => s.pitching);
  const total = (role: Role, key: string) => seasons.reduce((n, s) => n + Number(s[role]?.[key] ?? 0), 0);

  // Chart data: this season's pitches from detailed games (the pipeline already left out legacy games).
  const seasonOf = new Map((games ?? []).map((g) => [g.game_id, g.season]));
  const inSeason = { batting: pitches.as_batter.filter((p) => seasonOf.get(p.game_id) === current.season), pitching: pitches.as_pitcher.filter((p) => seasonOf.get(p.game_id) === current.season) };
  // Default to the role with more charted pitches (a pitcher's page opens on pitching).
  const chartRoles = (['batting', 'pitching'] as Role[])
    .filter((r) => inSeason[r].length || current.percentiles?.[r])
    .sort((a, b) => inSeason[b].length - inSeason[a].length);
  const role: Role = chartRoles.includes(params.get('as') as Role) ? (params.get('as') as Role) : (chartRoles[0] ?? 'batting');
  const hasCharts = chartRoles.length > 0;
  const view = params.get('view') === 'detailed' || params.get('view') === 'simple' ? params.get('view') : hasCharts ? 'simple' : 'detailed';
  const rows = applyFilter(inSeason[role], filter, role);

  const seasonRows = (r: Role) =>
    seasons
      .filter((s) => s[r])
      .map((s) => ({ key: s.season, line: s[r]!, lead: [s.season, s.team_ids.map((t) => teamName(teams, t)).join(', ')] }));
  const seasonTable = (r: Role, cols: StatCol[], title: string) => (
    <>
      <h3>{title}</h3>
      <StatTable role={r} season={current.season} cols={cols} rows={seasonRows(r)} leadHeaders={[ko.player.season, ko.player.team]} />
    </>
  );
  const logRows = (r: Role, list: GameLogRow[]) =>
    list
      .filter((g) => g.season === current.season)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .map((g) => {
        const lead = [g.date ? formatDate(g.date) : (g.label ?? g.game_id), teamName(teams, g.opponent)];
        if (r === 'batting') lead.push(((g.results as string[]) ?? []).map((x) => ko.paResults[x] ?? x).join(', '));
        return { key: g.game_id, line: g as unknown as Line, lead };
      });
  const splitRows = (s: SeasonLine, r: Role) => s.splits[r].map((sp) => ({ key: sp.key, line: sp, lead: [ko.splits[sp.key] ?? sp.key] }));

  const select = <K extends keyof ChartFilter>(k: K, label: string, options: [ChartFilter[K], string][]) => (
    <label>
      {label}
      <select value={filter[k]} onChange={(e) => setFilter({ ...filter, [k]: e.target.value as ChartFilter[K] })}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );

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
          {handsLabel(player.throws, player.bats, throws, bats) && <> · {handsLabel(player.throws, player.bats, throws, bats)}</>}
        </p>
        <p className="chips">
          {bats && <span className="chip">{ko.player.sample.batting(formatStat(total('batting', 'pa'), 'int'))}</span>}
          {throws && <span className="chip">{ko.player.sample.pitching(formatStat(total('pitching', 'bf'), 'int'))}</span>}
        </p>
        <div className="row">
          {seasons.length > 1 && (
            <label className="inline">
              {ko.player.season}{' '}
              <select value={current.season} onChange={(e) => setParam('season', e.target.value)}>
                {seasons.map((s) => (
                  <option key={s.season} value={s.season}>{s.season}</option>
                ))}
              </select>
            </label>
          )}
          <div className="seg" role="group" aria-label={ko.view.label}>
            {(['simple', 'detailed'] as const).map((v) => (
              <button key={v} type="button" className={view === v ? 'on' : ''} onClick={() => setParam('view', v)}>
                {ko.view[v]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section>
        <h2>
          {ko.charts.section} <span className="muted small">{current.season}</span>
        </h2>
        {!hasCharts ? (
          <p className="muted">{ko.charts.noDetailed}</p>
        ) : (
          <>
            <p className="muted small">{ko.charts.onlyDetailed}</p>
            <div className="filters">
              {chartRoles.length > 1 && (
                <div className="seg" role="group">
                  {chartRoles.map((r) => (
                    <button key={r} type="button" className={role === r ? 'on' : ''} onClick={() => setParam('as', r)}>
                      {r === 'batting' ? ko.charts.asBatter : ko.charts.asPitcher}
                    </button>
                  ))}
                </div>
              )}
              {select('hand', ko.charts.filterHand[role], [['', ko.charts.all], ['L', ko.charts.left], ['R', ko.charts.right]])}
              {select('count', ko.charts.count, [['', ko.charts.all], ...(['ahead', 'even', 'behind', 'two'] as const).map((c) => [c, ko.charts.countOptions[c]] as [ChartFilter['count'], string])])}
              {select('velo', ko.charts.velo, [['', ko.charts.all], ...(['lt100', '100', '110', '120'] as const).map((c) => [c, ko.charts.veloOptions[c]] as [ChartFilter['velo'], string])])}
              <span className="muted small">{ko.charts.pitchesShown(rows.length)}</span>
            </div>
            <div className="chart-grid">
              <PercentileBars data={current.percentiles?.[role] ?? null} role={role} season={current.season} />
              <SprayChart rows={rows} />
              {view === 'detailed' && <ZoneChart rows={rows} />}
              {view === 'detailed' && <VeloChart rows={rows} role={role} />}
            </div>
          </>
        )}
      </section>

      {view === 'detailed' && (
        <>
          {bats && (
            <section>
              <h2>{ko.player.batting}</h2>
              {seasonTable('batting', HITTING_STANDARD, ko.player.standard)}
              {seasonTable('batting', HITTING_DISCIPLINE, ko.player.discipline)}
              {seasonTable('batting', HITTING_BATTED_BALL, ko.player.battedBall)}
            </section>
          )}
          {throws && (
            <section>
              <h2>{ko.player.pitching}</h2>
              {seasonTable('pitching', PITCHING_STANDARD, ko.player.standard)}
              {seasonTable('pitching', PITCHING_STUFF, ko.player.stuff)}
            </section>
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
                <StatTable role="batting" season={current.season} cols={HITTING_GAME_LOG} rows={logRows('batting', game_log.batting)} leadHeaders={[ko.player.game, ko.player.opponent, ko.player.results]} />
              </>
            )}
            {current.pitching && (
              <>
                <h3>{ko.player.pitching}</h3>
                <StatTable role="pitching" season={current.season} cols={PITCHING_GAME_LOG} rows={logRows('pitching', game_log.pitching)} leadHeaders={[ko.player.game, ko.player.opponent]} />
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
