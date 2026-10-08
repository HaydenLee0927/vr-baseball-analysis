import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { saveBody, saveGame, type Draft, type NewPlayer, type SaveResult, type ServerData } from './data';
import {
  advance,
  battingSide,
  checkGame,
  FIELD_POSITIONS,
  fieldersOf,
  fieldingSide,
  hand,
  makeRow,
  movePlayer,
  POSITION_LABEL,
  remember,
  suggestPaResult,
  type BbType,
  type Contact,
  type Entry,
  type GameEvent,
  type HandDefaults,
  type Hand,
  type Issue,
  type PaResult,
  type PitchRow,
  type Result,
  type Side,
  type State,
} from './engine';
import { Choice, FieldDiagram, formatClock, PlayerPicker, PlayerSelect, RowEditor, VideoPane, ZoneGrid } from './parts';
import { People } from './people';

const RESULTS: Result[] = ['ball', 'called_strike', 'swinging_strike', 'foul', 'foul_tip', 'in_play', 'hbp'];
const RESULT_LABEL: Record<string, string> = {
  ball: 'Ball', called_strike: 'Called', swinging_strike: 'Swinging', foul: 'Foul', foul_tip: 'Foul tip', in_play: 'In play', hbp: 'HBP',
};
// Keyboard codes (layout-independent, so they work with a Korean keyboard layout too).
const RESULT_KEYS: Record<string, Result> = { KeyB: 'ball', KeyC: 'called_strike', KeyS: 'swinging_strike', KeyF: 'foul', KeyT: 'foul_tip', KeyX: 'in_play', KeyH: 'hbp' };
const KEY_HINT: Record<string, string> = { ball: 'B', called_strike: 'C', swinging_strike: 'S', foul: 'F', foul_tip: 'T', in_play: 'X', hbp: 'H' };
const PA_RESULTS: PaResult[] = ['1B', '2B', '3B', 'HR', 'BB', 'K', 'HBP', 'out', 'DP', 'FC', 'E', 'SF', 'SH'];
const PA_LABEL: Record<string, string> = { DP: 'double play', FC: "fielder's choice", E: 'error', SF: 'sac fly', SH: 'sac bunt' };
const BB_TYPES: BbType[] = ['ground', 'line', 'fly', 'popup', 'bunt'];
const CONTACT: Contact[] = ['weak', 'medium', 'hard'];
const EVENTS: GameEvent[] = ['SB', 'CS', 'WP', 'PB', 'BK', 'pickoff'];
const EVENT_LABEL: Record<string, string> = { SB: 'Stolen base', CS: 'Caught stealing', WP: 'Wild pitch', PB: 'Passed ball', BK: 'Balk', pickoff: 'Pickoff' };

interface Form {
  velo: string;
  pitchType: string | null;
  guess: boolean | null; // null = follow the game's "shown on stream" setting
  zone: number | null;
  result: Result | null;
  bbType: BbType | null;
  fielderPos: number | null;
  point: { x: number; y: number } | null;
  contact: Contact | null;
  paResult: PaResult | null;
  paTouched: boolean;
  notes: string;
  vodTs: number | null;
}
const emptyForm = (): Form => ({
  velo: '', pitchType: null, guess: null, zone: null, result: null, bbType: null, fielderPos: null,
  point: null, contact: null, paResult: null, paTouched: false, notes: '', vodTs: null,
});

function rowToState(r: PitchRow, next: State['next']): State {
  return {
    inning: r.inning, half: r.half, balls: r.balls, strikes: r.strikes, outs: r.outs,
    homeScore: r.home_score, awayScore: r.away_score, runners: [r.runner_1, r.runner_2, r.runner_3],
    paId: r.pa_id, batterId: r.batter_id, pitcherId: r.pitcher_id, catcherId: r.catcher_id, fielders: fieldersOf(r),
    pitcherHand: r.pitcher_hand, batterSide: r.batter_side, next,
  };
}

export function Chart(props: {
  data: ServerData;
  draft: Draft;
  onChange: (d: Draft) => void;
  onSetup: () => void;
  onClose: () => void;
}) {
  const { data, draft, onChange } = props;
  const { state, lineups, game } = draft;
  const people = useMemo(() => new People(data.players, data.aliases, draft.newPlayers), [data, draft.newPlayers]);
  const defaults: HandDefaults = useMemo(
    () => Object.fromEntries(data.players.map((p) => [p.player_id, { bats: p.default_bats || null, throws: p.default_throws || null }])),
    [data.players],
  );
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PitchRow | null>(null);
  // Substitution dialog: a defensive position (1-9) or 'batter' (pinch hitter).
  const [sub, setSub] = useState<number | 'batter' | null>(null);
  const [saving, setSaving] = useState<{ issues: Issue[]; result: SaveResult | null; error: string | null; busy: boolean } | null>(null);
  const clock = useRef<() => number | null>(() => null);
  const veloRef = useRef<HTMLInputElement>(null);
  const onClock = useCallback((get: () => number | null) => (clock.current = get), []);

  const bat: Side = battingSide(state.half);
  const fld: Side = fieldingSide(state.half);
  const typesShown = draft.pitchTypesShown === 'yes' || (draft.pitchTypesShown === 'from' && state.inning >= (draft.pitchTypesFromInning ?? Infinity));
  const guess = form.guess ?? !typesShown;

  const update = (patch: Partial<Draft>) => onChange({ ...draft, ...patch, updatedAt: new Date().toISOString() });
  const setState = (patch: Partial<State>) => update({ state: { ...state, ...patch } });

  function commit(entry: Entry) {
    if (!state.batterId || !state.pitcherId) return setError('Set the batter and pitcher first.');
    const row = makeRow(game.game_id, draft.rows.length + 1, state, entry);
    const memory = remember(draft.memory, row);
    update({
      rows: [...draft.rows, row],
      before: [...draft.before, state],
      state: advance(state, row, lineups, memory, defaults),
      memory,
    });
    setForm(emptyForm());
    setError(null);
    veloRef.current?.focus();
  }

  function commitPitch() {
    const f = form;
    if (!f.result) return setError('Choose a result (B C S F T X H).');
    if (f.result === 'in_play') {
      if (!f.paResult) return setError('Choose how the at-bat ended.');
      if (!f.fielderPos) return setError('Choose the fielder (for a home run, the field it left over).');
      if (!draft.lite && !f.bbType) return setError('Choose the ball type.');
    }
    const velo = f.velo.trim() === '' ? null : Number(f.velo);
    if (velo !== null && (Number.isNaN(velo) || velo < 30 || velo > 200)) return setError('Velocity looks wrong.');
    commit({
      kind: 'pitch',
      velo,
      pitchType: draft.lite ? null : f.pitchType,
      pitchTypeSource: f.pitchType ? (guess ? 'charter' : 'stream') : null,
      zone: f.zone,
      result: f.result,
      bbType: draft.lite ? null : f.bbType,
      fieldX: f.point?.x ?? null,
      fieldY: f.point?.y ?? null,
      fielderPos: f.fielderPos,
      contact: draft.lite ? null : f.contact,
      paResult: f.paResult,
      vodTs: f.vodTs ?? clock.current(),
      notes: f.notes.trim() || null,
    });
  }

  function commitEvent(event: GameEvent, notes: string | null = form.notes.trim() || null) {
    commit({ kind: 'event', event, vodTs: clock.current(), notes });
  }

  function chooseResult(result: Result | null) {
    setForm((f) => {
      const keepBip = result === 'in_play';
      return {
        ...f,
        result,
        vodTs: f.vodTs ?? (result ? clock.current() : null),
        paResult: f.paTouched ? f.paResult : result ? suggestPaResult(state, result) : null,
        bbType: keepBip ? f.bbType : null,
        fielderPos: keepBip ? f.fielderPos : null,
        point: keepBip ? f.point : null,
        contact: keepBip ? f.contact : null,
      };
    });
  }

  function undo() {
    if (!draft.rows.length) return;
    const last = draft.rows[draft.rows.length - 1];
    const prev = draft.before[draft.before.length - 1] ?? rowToState(last, state.next);
    update({ rows: draft.rows.slice(0, -1), before: draft.before.slice(0, -1), state: prev });
  }

  function holder(pos: number | 'batter'): string | null {
    if (pos === 'batter') return state.batterId;
    if (pos === 1) return state.pitcherId;
    if (pos === 2) return state.catcherId;
    return state.fielders[pos] ?? null;
  }

  /** Put `id` in for whoever holds `pos`; they also take that player's batting-order spot. */
  function substitute(pos: number | 'batter', id: string, added?: NewPlayer) {
    const side = pos === 'batter' ? bat : fld;
    const old = holder(pos);
    const label = pos === 'batter' ? 'PH' : POSITION_LABEL[pos];
    let { rows, before } = draft;
    if (state.batterId && state.pitcherId) {
      const row = makeRow(game.game_id, rows.length + 1, state, {
        kind: 'event', event: 'sub', vodTs: clock.current(), notes: `sub ${label}: ${people.name(old)} -> ${added?.vrchat_name ?? people.name(id)}`,
      });
      rows = [...rows, row];
      before = [...before, state];
    }
    const l = { ...lineups[side], fielders: { ...lineups[side].fielders } };
    const s: State = { ...state, fielders: { ...state.fielders } };
    if (old && l.order.includes(old)) l.order = l.order.map((p) => (p === old ? id : p));
    else if (pos === 'batter' && !l.order.includes(id)) l.order = [...l.order, id];
    if (l.dh === old) l.dh = id;
    // A player already in the game who moves here leaves their old position empty.
    if (pos !== 'batter') {
      for (const p of FIELD_POSITIONS) {
        if (s.fielders[p] === id) s.fielders[p] = null;
        if (l.fielders[p] === id) l.fielders[p] = null;
      }
      if (pos !== 2 && s.catcherId === id) l.catcher = s.catcherId = null;
      if (pos !== 1 && s.pitcherId === id) l.pitcher = s.pitcherId = null;
    }
    if (pos === 'batter') {
      s.batterId = id;
      s.batterSide = hand(id, 'bats', draft.memory, defaults);
    } else if (pos === 1) {
      l.pitcher = s.pitcherId = id;
      s.pitcherHand = hand(id, 'throws', draft.memory, defaults);
    } else if (pos === 2) {
      l.catcher = s.catcherId = id;
    } else {
      l.fielders[pos] = s.fielders[pos] = id;
    }
    // One update: a separate newPlayers update would be overwritten by this one (both spread the same draft).
    const newPlayers = added ? [...draft.newPlayers, added] : draft.newPlayers;
    update({ rows, before, lineups: { ...lineups, [side]: l }, state: s, newPlayers });
    setSub(null);
  }

  /** Move a player already in the game to another position, swapping with its holder (no new player, no event row). */
  function setPosition(pos: number, id: string | null) {
    const moved = movePlayer(lineups[fld], state, pos, id);
    const s = moved.state;
    if (s.pitcherId !== state.pitcherId) s.pitcherHand = hand(s.pitcherId, 'throws', draft.memory, defaults);
    update({ state: s, lineups: { ...lineups, [fld]: moved.lineup } });
  }

  async function save(force: boolean) {
    const issues = checkGame(draft.rows, {
      lite: draft.lite,
      final: game.home_final !== null && game.away_final !== null ? { home: game.home_final, away: game.away_final } : null,
    });
    if (issues.length && !force) return setSaving({ issues, result: null, error: null, busy: false });
    setSaving({ issues, result: null, error: null, busy: true });
    try {
      const result = await saveGame(saveBody(draft));
      setSaving({ issues, result, error: null, busy: false });
      if (result.ok) update({ savedAt: new Date().toISOString() });
    } catch (e) {
      setSaving({ issues, result: null, error: e instanceof Error ? e.message : String(e), busy: false });
    }
  }

  // Keyboard: result keys, V stamps video time, Enter commits, Ctrl+Z undoes, Esc clears.
  const handlers = useRef({ commitPitch, chooseResult, undo });
  handlers.current = { commitPitch, chooseResult, undo };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.isComposing || document.querySelector('.modal')) return;
      const t = e.target as HTMLElement;
      const shortcutField = t.dataset?.shortcuts === '1';
      const typing = !shortcutField && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'checkbox'));
      if (e.key === 'Enter' && t.tagName !== 'BUTTON' && t.tagName !== 'TEXTAREA' && !t.closest('.picker')) {
        e.preventDefault();
        handlers.current.commitPitch();
        return;
      }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        handlers.current.undo();
      } else if (e.code === 'Escape') {
        setForm(emptyForm());
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && RESULT_KEYS[e.code]) {
        e.preventDefault();
        handlers.current.chooseResult(RESULT_KEYS[e.code]);
      } else if (!e.ctrlKey && !e.metaKey && e.code === 'KeyV') {
        e.preventDefault();
        setForm((f) => ({ ...f, vodTs: clock.current() }));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const teamPlayers = (side: Side) => {
    const l = lineups[side];
    return [...new Set([...l.order, l.pitcher, l.catcher, l.dh, ...Object.values(l.fielders)].filter(Boolean) as string[])];
  };
  const handPick = (value: Hand | null, onPick: (h: Hand | null) => void) => (
    <Choice options={['L', 'R'] as Hand[]} value={value} onChange={onPick} />
  );
  const counter = (label: string, value: number, max: number, onSet: (n: number) => void) => (
    <div className="counter">
      <span>{label}</span>
      {Array.from({ length: max + 1 }, (_, n) => (
        <button type="button" key={n} className={n === value ? 'on' : ''} onClick={() => onSet(n)}>
          {n}
        </button>
      ))}
    </div>
  );

  return (
    <div className="chart">
      <header className="topbar">
        <strong>{game.label || game.game_id}</strong>
        <span className="muted">
          {game.away_team_id} @ {game.home_team_id}
        </span>
        <span className="spacer" />
        <label className="small">
          Final (away–home)
          <input className="num" value={game.away_final ?? ''} onChange={(e) => update({ game: { ...game, away_final: e.target.value === '' ? null : Number(e.target.value) } })} />
          <input className="num" value={game.home_final ?? ''} onChange={(e) => update({ game: { ...game, home_final: e.target.value === '' ? null : Number(e.target.value) } })} />
        </label>
        <select value={game.chart_status} onChange={(e) => update({ game: { ...game, chart_status: e.target.value as 'partial' | 'complete' } })}>
          <option value="partial">partial</option>
          <option value="complete">complete</option>
        </select>
        <button type="button" className="secondary" onClick={undo} disabled={!draft.rows.length} title="Ctrl+Z">
          Undo
        </button>
        <button type="button" className="secondary" onClick={props.onSetup}>
          Setup
        </button>
        <button type="button" onClick={() => void save(false)}>
          Save to data/raw
        </button>
        <button type="button" className="secondary" onClick={props.onClose}>
          Close
        </button>
      </header>

      <div className="panes">
        <section className="pane">
          <VideoPane url={game.vod_url} onClock={onClock} />
          <div className="small">
            Video time for this pitch: <b>{formatClock(form.vodTs)}</b> <kbd>V</kbd> to stamp
          </div>
        </section>

        <section className="pane state">
          <h2>
            {state.half === 'top' ? '▲' : '▼'} {state.inning}
            <span className="score">
              {game.away_team_id} {state.awayScore} – {state.homeScore} {game.home_team_id}
            </span>
          </h2>
          <div className="kv">
            <span>Inning</span>
            <span className="row">
              <input className="num" type="number" min={1} value={state.inning} onChange={(e) => setState({ inning: Number(e.target.value) || 1 })} />
              <Choice options={['top', 'bot'] as const} value={state.half} onChange={(h) => h && setState({ half: h })} />
            </span>
            <span>Score</span>
            <span className="row">
              away <input className="num" type="number" min={0} value={state.awayScore} onChange={(e) => setState({ awayScore: Number(e.target.value) || 0 })} />
              home <input className="num" type="number" min={0} value={state.homeScore} onChange={(e) => setState({ homeScore: Number(e.target.value) || 0 })} />
            </span>
          </div>
          {counter('Balls', state.balls, 3, (n) => setState({ balls: n }))}
          {counter('Strikes', state.strikes, 2, (n) => setState({ strikes: n }))}
          {counter('Outs', state.outs, 2, (n) => setState({ outs: n }))}
          <div className="kv">
            <span>Batter</span>
            <span className="row">
              <PlayerSelect
                people={people}
                value={state.batterId}
                options={lineups[bat].order}
                onChange={(id) => {
                  const idx = id ? lineups[bat].order.indexOf(id) : -1;
                  setState({ batterId: id, batterSide: hand(id, 'bats', draft.memory, defaults), next: idx >= 0 ? { ...state.next, [bat]: idx } : state.next });
                }}
              />
              {handPick(state.batterSide, (h) => setState({ batterSide: h }))}
            </span>
            <span>Pitcher</span>
            <span className="row">
              <PlayerSelect people={people} value={state.pitcherId} options={teamPlayers(fld)} onChange={(id) => setPosition(1, id)} />
              {handPick(state.pitcherHand, (h) => setState({ pitcherHand: h }))}
            </span>
            <span>Catcher</span>
            <PlayerSelect people={people} value={state.catcherId} options={teamPlayers(fld)} onChange={(id) => setPosition(2, id)} />
            <span>Defense</span>
            <span className="defense">
              {FIELD_POSITIONS.map((p) => (
                <label key={p}>
                  {POSITION_LABEL[p]}
                  <PlayerSelect people={people} value={state.fielders[p] ?? null} options={teamPlayers(fld)} onChange={(id) => setPosition(p, id)} />
                </label>
              ))}
            </span>
            {(['1st', '2nd', '3rd'] as const).map((b, i) => (
              <span key={b} className="contents">
                <span>Runner {b}</span>
                <PlayerSelect
                  people={people}
                  value={state.runners[i]}
                  options={teamPlayers(bat)}
                  onChange={(id) => {
                    const runners = [...state.runners] as State['runners'];
                    runners[i] = id;
                    setState({ runners });
                  }}
                />
              </span>
            ))}
          </div>
          <h3>Between pitches</h3>
          <div className="choice">
            {EVENTS.map((ev) => (
              <button type="button" key={ev} onClick={() => commitEvent(ev)}>
                {EVENT_LABEL[ev]}
              </button>
            ))}
          </div>
          <div className="choice">
            <button type="button" onClick={() => setSub(1)}>Pitching change</button>
            <button type="button" onClick={() => setSub(2)}>Defensive sub</button>
            <button type="button" onClick={() => setSub('batter')}>Pinch hitter</button>
          </div>
          <p className="muted small">After an event, check the runners and outs above.</p>
        </section>

        <section className="pane entry">
          <div className="row">
            <label>
              Velocity ({game.velo_unit})
              <input
                ref={veloRef}
                data-shortcuts="1"
                className="velo"
                inputMode="decimal"
                autoFocus
                value={form.velo}
                onChange={(e) => setForm({ ...form, velo: e.target.value.replace(/[^0-9.]/g, '') })}
                placeholder="blank if not shown"
              />
            </label>
            <ZoneGrid value={form.zone} onChange={(zone) => setForm({ ...form, zone })} />
          </div>

          {!draft.lite && (
            <div>
              <h3>Pitch type</h3>
              <Choice options={data.pitchTypes.map((p) => p.code)} value={form.pitchType} onChange={(pitchType) => setForm({ ...form, pitchType })} />
              <label className="check small">
                <input type="checkbox" checked={guess} onChange={(e) => setForm({ ...form, guess: e.target.checked })} />
                my guess {!typesShown && <span className="muted">(stream is not showing pitch types)</span>}
              </label>
            </div>
          )}

          <h3>Result</h3>
          <Choice options={RESULTS} value={form.result} onChange={chooseResult} labels={RESULT_LABEL} keys={KEY_HINT} />

          {form.result === 'in_play' && (
            <div className="bip">
              <FieldDiagram
                point={form.point}
                fielder={form.fielderPos}
                onPoint={(point, nearest) => setForm({ ...form, point, fielderPos: form.fielderPos ?? nearest })}
              />
              <div>
                <h3>Fielder</h3>
                <Choice options={[1, 2, 3, 4, 5, 6, 7, 8, 9]} value={form.fielderPos} onChange={(fielderPos) => setForm({ ...form, fielderPos })} />
                {!draft.lite && (
                  <>
                    <h3>Ball type</h3>
                    <Choice options={BB_TYPES} value={form.bbType} onChange={(bbType) => setForm({ ...form, bbType })} />
                    <h3>Contact (optional)</h3>
                    <Choice options={CONTACT} value={form.contact} onChange={(contact) => setForm({ ...form, contact })} />
                  </>
                )}
                {form.point && (
                  <button type="button" className="link small" onClick={() => setForm({ ...form, point: null })}>
                    clear landing spot
                  </button>
                )}
              </div>
            </div>
          )}

          {form.result && (
            <>
              <h3>At-bat outcome {form.result !== 'in_play' && <span className="muted small">(only if the at-bat ended)</span>}</h3>
              <Choice
                options={PA_RESULTS}
                value={form.paResult}
                labels={PA_LABEL}
                onChange={(paResult) => setForm({ ...form, paResult, paTouched: true })}
              />
            </>
          )}

          <label>
            Notes
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="glitches, misplays; not handedness or steals" />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="button" className="commit" onClick={commitPitch}>
            Record pitch <kbd>Enter</kbd>
          </button>
        </section>
      </div>

      <section className="rows">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Inn</th><th>PA</th><th>Batter</th><th>Pitcher</th><th>Count</th><th>Outs</th><th>Velo</th><th>Type</th>
              <th>Zone</th><th>Result</th><th>Outcome</th><th>Fld</th><th>Time</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {[...draft.rows].reverse().map((r) => (
              <tr key={r.pitch_id} onClick={() => setEditing(r)} title="Click to edit">
                <td>{r.pitch_id}</td>
                <td>{r.half === 'top' ? '▲' : '▼'}{r.inning}</td>
                <td>{r.pa_id}</td>
                <td>{people.name(r.batter_id)}</td>
                <td>{people.name(r.pitcher_id)}</td>
                <td>{r.balls}-{r.strikes}</td>
                <td>{r.outs}</td>
                <td>{r.velo ?? ''}</td>
                <td>{r.pitch_type ?? ''}{r.pitch_type_source === 'charter' ? '?' : ''}</td>
                <td>{r.zone ?? ''}</td>
                <td>{r.event ?? (r.result ? RESULT_LABEL[r.result] : '')}</td>
                <td>{r.pa_result ?? ''}</td>
                <td>{r.fielder_pos ?? ''}</td>
                <td>{formatClock(r.vod_ts)}</td>
                <td className="muted">{r.notes ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {editing && (
        <RowEditor
          row={editing}
          schema={data.pitchSchema}
          people={people}
          onCancel={() => setEditing(null)}
          onSave={(row) => {
            update({ rows: draft.rows.map((r) => (r.pitch_id === row.pitch_id ? row : r)) });
            setEditing(null);
          }}
        />
      )}

      {sub !== null && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="card">
            <h2>{sub === 'batter' ? 'Pinch hitter' : sub === 1 ? 'Pitching change' : 'Defensive substitution'}</h2>
            {sub !== 'batter' && sub !== 1 && (
              <label>
                Position{' '}
                <select value={sub} onChange={(e) => setSub(Number(e.target.value))}>
                  {[2, ...FIELD_POSITIONS].map((p) => (
                    <option key={p} value={p}>{POSITION_LABEL[p]}</option>
                  ))}
                </select>
              </label>
            )}
            <p className="muted small">
              Replacing {people.name(holder(sub)) || '—'} ({game[`${sub === 'batter' ? bat : fld}_team_id`]}). The new player also takes their batting-order spot.
              To move players already in the game between positions (e.g. a fielder comes in to pitch), use the Pitcher, Catcher and Defense selects instead: they swap the two players.
            </p>
            <PlayerPicker
              people={people}
              placeholder="VRChat name"
              onPick={(id, added) => substitute(sub, id, added)}
            />
            <button type="button" className="secondary" onClick={() => setSub(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {saving && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="card save">
            <h2>Save to data/raw</h2>
            {saving.issues.length > 0 && (
              <>
                <p>The export checks found {saving.issues.length} problem{saving.issues.length === 1 ? '' : 's'}:</p>
                <ul className="issues">
                  {saving.issues.map((i, n) => (
                    <li key={n}>
                      {i.pitchId !== null && <b>#{i.pitchId} </b>}
                      {i.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {saving.busy && <p>Saving and validating…</p>}
            {saving.error && <p className="error">{saving.error}</p>}
            {saving.result && (
              <>
                <p className={saving.result.ok ? '' : 'error'}>
                  {saving.result.ok ? 'Saved' : 'Saved, but validation failed'}: <code>{saving.result.file}</code>
                  {saving.result.added.players > 0 && ` · ${saving.result.added.players} new player(s)`}
                  {saving.result.added.teams > 0 && ` · ${saving.result.added.teams} new team(s)`}
                </p>
                <pre className="output">{saving.result.output}</pre>
                <p className="muted small">Commit and push the data repo to publish it.</p>
              </>
            )}
            <div className="row">
              {!saving.result && !saving.busy && saving.issues.length > 0 && (
                <button type="button" onClick={() => void save(true)}>
                  Save anyway
                </button>
              )}
              <button type="button" className="secondary" onClick={() => setSaving(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
