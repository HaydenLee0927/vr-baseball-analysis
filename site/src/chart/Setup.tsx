import { useMemo, useState } from 'react';
import type { Draft, GameMeta, NewPlayer, ServerData } from './data';
import { FIELD_POSITIONS, POSITION_LABEL, type Lineup, type Lineups, type Side } from './engine';
import { PlayerPicker } from './parts';
import { People } from './people';

const ID = /^[a-z0-9][a-z0-9_-]*$/;

export type SetupResult = Pick<Draft, 'game' | 'lineups' | 'pitchTypesShown' | 'pitchTypesFromInning' | 'lite' | 'dh' | 'newPlayers' | 'newTeams'>;

const emptyLineup = (): Lineup => ({ order: [], pitcher: null, catcher: null, fielders: {}, dh: null });

/** Position a player holds in a lineup: 1 P, 2 C, 3-9 fielders, 'DH', or '' for none. */
function positionOf(l: Lineup, id: string): string {
  if (l.pitcher === id) return '1';
  if (l.catcher === id) return '2';
  const f = FIELD_POSITIONS.find((p) => l.fielders[p] === id);
  if (f) return String(f);
  return l.dh === id ? 'DH' : '';
}

/** Give `id` the position `pos`, taking it from whoever had it and clearing id's old position. */
function assignPosition(l: Lineup, id: string, pos: string): Lineup {
  const next: Lineup = { ...l, fielders: { ...l.fielders } };
  if (next.pitcher === id) next.pitcher = null;
  if (next.catcher === id) next.catcher = null;
  if (next.dh === id) next.dh = null;
  for (const p of FIELD_POSITIONS) if (next.fielders[p] === id) next.fielders[p] = null;
  if (pos === '1') next.pitcher = id;
  else if (pos === '2') next.catcher = id;
  else if (pos === 'DH') next.dh = id;
  else if (pos) next.fielders[Number(pos)] = id;
  return next;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyGame(): GameMeta {
  return {
    game_id: '', season: '', date: today(), label: null,
    home_team_id: '', away_team_id: '', home_final: null, away_final: null, vod_url: null,
    charted_by: null, chart_status: 'partial', velo_unit: 'km/h', game_version: null,
  };
}

export function Setup(props: { data: ServerData; draft: Draft | null; takenIds: Set<string>; onDone: (r: SetupResult) => void; onCancel: () => void }) {
  const editing = props.draft !== null;
  const [game, setGame] = useState<GameMeta>(props.draft?.game ?? emptyGame());
  const [lineups, setLineups] = useState<Lineups>(
    props.draft?.lineups ?? { home: emptyLineup(), away: emptyLineup() },
  );
  const [dh, setDh] = useState(props.draft?.dh ?? false);
  const [shown, setShown] = useState(props.draft?.pitchTypesShown ?? 'yes');
  const [fromInning, setFromInning] = useState<number | null>(props.draft?.pitchTypesFromInning ?? null);
  const [lite, setLite] = useState(props.draft?.lite ?? false);
  const [newPlayers, setNewPlayers] = useState<NewPlayer[]>(props.draft?.newPlayers ?? []);
  const [errors, setErrors] = useState<string[]>([]);
  const people = useMemo(() => new People(props.data.players, props.data.aliases, newPlayers), [props.data, newPlayers]);

  const teamIds = props.data.teams.map((t) => t.team_id);
  const seasons = [...new Set(props.data.games.map((g) => g.season))];
  const suggestedId = [game.date, game.away_team_id, game.home_team_id].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  const set = <K extends keyof GameMeta>(k: K, v: GameMeta[K]) => setGame({ ...game, [k]: v });
  const text = (v: string) => (v.trim() === '' ? null : v.trim());
  const setLineup = (side: Side, l: Partial<Lineup>) => setLineups({ ...lineups, [side]: { ...lineups[side], ...l } });

  function submit() {
    const e: string[] = [];
    if (!ID.test(game.game_id)) e.push('Game ID: lowercase letters, digits, - and _ only.');
    if (!editing && props.takenIds.has(game.game_id)) e.push(`Game ID "${game.game_id}" already exists. Open it from the start screen instead.`);
    if (!game.season.trim()) e.push('Season is required.');
    for (const k of ['home_team_id', 'away_team_id'] as const)
      if (!ID.test(game[k])) e.push(`${k === 'home_team_id' ? 'Home' : 'Away'} team ID: lowercase letters, digits, - and _ only.`);
    if (game.home_team_id === game.away_team_id) e.push('Home and away teams must differ.');
    for (const side of ['away', 'home'] as Side[]) {
      if (!lineups[side].order.length) e.push(`${side} batting order is empty.`);
      if (!lineups[side].pitcher) e.push(`${side} pitcher is not set.`);
    }
    if (shown === 'from' && !fromInning) e.push('Enter the inning pitch types started showing.');
    setErrors(e);
    if (e.length) return;
    const warnings: string[] = [];
    for (const side of ['away', 'home'] as Side[]) {
      const l = lineups[side];
      const open = [2, ...FIELD_POSITIONS].filter((p) => (p === 2 ? !l.catcher : !l.fielders[p])).map((p) => POSITION_LABEL[p]);
      if (open.length) warnings.push(`${side}: no player at ${open.join(', ')}`);
      if (!dh && l.pitcher && !l.order.includes(l.pitcher)) warnings.push(`${side}: the pitcher is not in the batting order (no DH)`);
      if (dh && !l.dh) warnings.push(`${side}: no DH chosen`);
    }
    if (warnings.length && !confirm(`Defense is incomplete:\n\n${warnings.join('\n')}\n\nStart anyway? You can fill it in later.`)) return;
    const newTeams = [game.home_team_id, game.away_team_id]
      .filter((t) => !teamIds.includes(t))
      .map((team_id) => ({ team_id, display_name: null }));
    props.onDone({ game: { ...game, season: game.season.trim() }, lineups, pitchTypesShown: shown, pitchTypesFromInning: shown === 'from' ? fromInning : null, lite, dh, newPlayers, newTeams });
  }

  const lineupEditor = (side: Side) => {
    const l = lineups[side];
    const move = (i: number, d: number) => {
      const order = [...l.order];
      [order[i], order[i + d]] = [order[i + d], order[i]];
      setLineup(side, { order });
    };
    return (
      <section className="card">
        <h3>{side === 'away' ? 'Away' : 'Home'} lineup</h3>
        <ol className="order">
          {l.order.map((id, i) => (
            <li key={id}>
              <span>{people.name(id)}</span>
              <select value={positionOf(l, id)} onChange={(e) => setLineups({ ...lineups, [side]: assignPosition(l, id, e.target.value) })} aria-label="position">
                <option value="">pos.</option>
                {[1, 2, ...FIELD_POSITIONS].filter((p) => p !== 1 || !dh).map((p) => (
                  <option key={p} value={String(p)}>{POSITION_LABEL[p]}</option>
                ))}
                {dh && <option value="DH">DH</option>}
              </select>
              <button type="button" className="mini" disabled={i === 0} onClick={() => move(i, -1)} aria-label="move up">↑</button>
              <button type="button" className="mini" disabled={i === l.order.length - 1} onClick={() => move(i, 1)} aria-label="move down">↓</button>
              <button type="button" className="mini" onClick={() => setLineups({ ...lineups, [side]: { ...assignPosition(l, id, ''), order: l.order.filter((x) => x !== id) } })} aria-label="remove">✕</button>
            </li>
          ))}
        </ol>
        <PlayerPicker
          people={people}
          placeholder="Add batter (VRChat name)"
          onNewPlayer={(p) => setNewPlayers((ps) => [...ps, p])}
          onPick={(id) => !l.order.includes(id) && setLineup(side, { order: [...l.order, id] })}
        />
        <div className="kv">
          <span>Pitcher</span>
          <b>{people.name(l.pitcher) || '—'}</b>
          <PlayerPicker people={people} placeholder="Set pitcher" onNewPlayer={(p) => setNewPlayers((ps) => [...ps, p])} onPick={(id) => setLineups({ ...lineups, [side]: assignPosition(l, id, '1') })} />
          <span>Catcher</span>
          <b>{people.name(l.catcher) || '—'}</b>
          <PlayerPicker people={people} placeholder="Set catcher" onNewPlayer={(p) => setNewPlayers((ps) => [...ps, p])} onPick={(id) => setLineups({ ...lineups, [side]: assignPosition(l, id, '2') })} />
        </div>
      </section>
    );
  };

  return (
    <main className="setup">
      <h1>{editing ? 'Game setup' : 'New game'}</h1>
      <section className="card form">
        <label>
          Season / competition
          <input list="seasons" value={game.season} onChange={(e) => set('season', e.target.value)} placeholder="e.g. wbd-2026" />
          <datalist id="seasons">{seasons.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label>
          Round / label
          <input value={game.label ?? ''} onChange={(e) => set('label', text(e.target.value))} placeholder="e.g. 8강" />
        </label>
        <label>
          Date
          <input type="date" value={game.date ?? ''} onChange={(e) => set('date', e.target.value || null)} />
        </label>
        <label>
          Away team ID
          <input list="teams" value={game.away_team_id} onChange={(e) => set('away_team_id', e.target.value.trim())} />
        </label>
        <label>
          Home team ID
          <input list="teams" value={game.home_team_id} onChange={(e) => set('home_team_id', e.target.value.trim())} />
          <datalist id="teams">{teamIds.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <label>
          Game ID
          <span className="row">
            <input value={game.game_id} disabled={editing} onChange={(e) => set('game_id', e.target.value.trim())} placeholder={suggestedId} />
            {!editing && suggestedId && (
              <button type="button" className="secondary" onClick={() => set('game_id', suggestedId)}>
                Use suggested
              </button>
            )}
          </span>
        </label>
        <label>
          Video link
          <input value={game.vod_url ?? ''} onChange={(e) => set('vod_url', text(e.target.value))} placeholder="YouTube, CHZZK or SOOP URL" />
        </label>
        <label>
          Charted by
          <input value={game.charted_by ?? ''} onChange={(e) => set('charted_by', text(e.target.value))} />
        </label>
        <label>
          Pitch type shown on stream?
          <span className="row">
            <select value={shown} onChange={(e) => setShown(e.target.value as Draft['pitchTypesShown'])}>
              <option value="yes">yes</option>
              <option value="no">no</option>
              <option value="from">from inning…</option>
            </select>
            {shown === 'from' && (
              <input type="number" min={1} value={fromInning ?? ''} onChange={(e) => setFromInning(e.target.value ? Number(e.target.value) : null)} style={{ width: '5em' }} />
            )}
          </span>
        </label>
        <label>
          Velocity unit
          <select value={game.velo_unit} onChange={(e) => set('velo_unit', e.target.value as GameMeta['velo_unit'])}>
            <option>km/h</option>
            <option>mph</option>
          </select>
        </label>
        <label>
          Game version (optional)
          <input value={game.game_version ?? ''} onChange={(e) => set('game_version', text(e.target.value))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={dh} onChange={(e) => setDh(e.target.checked)} />
          DH used (the pitcher does not bat)
        </label>
        <label className="check">
          <input type="checkbox" checked={lite} onChange={(e) => setLite(e.target.checked)} />
          Lite mode (velocity, zone, result, at-bat outcome and fielder only)
        </label>
      </section>
      <div className="lineups">
        {lineupEditor('away')}
        {lineupEditor('home')}
      </div>
      {errors.length > 0 && (
        <ul className="issues" role="alert">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      <div className="row">
        <button type="button" onClick={submit}>
          {editing ? 'Save setup' : 'Start charting'}
        </button>
        <button type="button" className="secondary" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </main>
  );
}
