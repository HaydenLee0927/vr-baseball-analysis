// Game state machine for the charting tool. Pure functions, no React.
//
// A row records the state BEFORE its pitch or event (as in data/schema/pitches.schema.json).
// `advance` computes the state before the next entry; the charter can then correct it.

export type Half = 'top' | 'bot';
export type Hand = 'L' | 'R';
export type Side = 'home' | 'away';
export type Result = 'ball' | 'called_strike' | 'swinging_strike' | 'foul' | 'foul_tip' | 'in_play' | 'hbp';
export type GameEvent = 'SB' | 'CS' | 'WP' | 'PB' | 'BK' | 'pickoff' | 'sub';
export type PaResult = '1B' | '2B' | '3B' | 'HR' | 'BB' | 'K' | 'HBP' | 'out' | 'FC' | 'E' | 'SF' | 'SH' | 'DP';
export type BbType = 'ground' | 'line' | 'fly' | 'popup' | 'bunt';
export type Contact = 'weak' | 'medium' | 'hard';
type Bases = [string | null, string | null, string | null];

export interface PitchRow {
  game_id: string;
  pitch_id: number;
  inning: number;
  half: Half;
  pa_id: number;
  pitcher_id: string;
  batter_id: string;
  catcher_id: string | null;
  fielder_3: string | null;
  fielder_4: string | null;
  fielder_5: string | null;
  fielder_6: string | null;
  fielder_7: string | null;
  fielder_8: string | null;
  fielder_9: string | null;
  pitcher_hand: Hand | null;
  batter_side: Hand | null;
  home_score: number;
  away_score: number;
  balls: number;
  strikes: number;
  outs: number;
  runner_1: string | null;
  runner_2: string | null;
  runner_3: string | null;
  velo: number | null;
  pitch_type: string | null;
  pitch_type_source: 'stream' | 'charter' | null;
  zone: number | null;
  result: Result | null;
  event: GameEvent | null;
  bb_type: BbType | null;
  field_x: number | null;
  field_y: number | null;
  fielder_pos: number | null;
  contact_quality: Contact | null;
  pa_result: PaResult | null;
  rbi: number | null;
  vod_ts: number | null;
  notes: string | null;
}

/** Positions 3-9 (Savant numbering); pitcher (1) and catcher (2) are kept separately. */
export const FIELD_POSITIONS = [3, 4, 5, 6, 7, 8, 9] as const;
export const POSITION_LABEL: Record<number, string> = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF' };
export type Fielders = Partial<Record<number, string | null>>;

export interface Lineup {
  order: string[];
  pitcher: string | null;
  catcher: string | null;
  fielders: Fielders;
  /** Designated hitter in the batting order, when the game uses one. */
  dh: string | null;
}

export function fieldersOf(row: PitchRow): Fielders {
  return Object.fromEntries(FIELD_POSITIONS.map((p) => [p, row[`fielder_${p}`]]));
}
export type Lineups = Record<Side, Lineup>;
/** Last hand each player used in this game, carried to their next appearance. */
export type HandMemory = Record<string, { throws?: Hand; bats?: Hand }>;
/** Player defaults from players.csv (S = switch, which gives no default). */
export type HandDefaults = Record<string, { throws?: string | null; bats?: string | null }>;

export interface State {
  inning: number;
  half: Half;
  balls: number;
  strikes: number;
  outs: number;
  homeScore: number;
  awayScore: number;
  runners: Bases;
  paId: number;
  batterId: string | null;
  pitcherId: string | null;
  catcherId: string | null;
  fielders: Fielders;
  pitcherHand: Hand | null;
  batterSide: Hand | null;
  /** Lineup index of the batter now up (batting team) or due up next half (fielding team). */
  next: Record<Side, number>;
}

export interface PitchEntry {
  kind: 'pitch';
  velo: number | null;
  pitchType: string | null;
  pitchTypeSource: 'stream' | 'charter' | null;
  zone: number | null;
  result: Result;
  bbType: BbType | null;
  fieldX: number | null;
  fieldY: number | null;
  fielderPos: number | null;
  contact: Contact | null;
  paResult: PaResult | null;
  vodTs: number | null;
  notes: string | null;
}
export interface EventEntry {
  kind: 'event';
  event: GameEvent;
  vodTs: number | null;
  notes: string | null;
}
export type Entry = PitchEntry | EventEntry;

export const battingSide = (half: Half): Side => (half === 'top' ? 'away' : 'home');
export const fieldingSide = (half: Half): Side => (half === 'top' ? 'home' : 'away');
const STRIKE_RESULTS: Result[] = ['called_strike', 'swinging_strike'];
const PA_CUT_EVENTS: GameEvent[] = ['CS', 'pickoff'];

/** Hand a player starts an appearance with: last used in this game, else their default. */
export function hand(id: string | null, role: 'throws' | 'bats', memory: HandMemory, defaults: HandDefaults): Hand | null {
  if (!id) return null;
  const remembered = memory[id]?.[role];
  if (remembered) return remembered;
  const d = defaults[id]?.[role];
  return d === 'L' || d === 'R' ? d : null;
}

function batterAt(lineups: Lineups, side: Side, index: number): string | null {
  const order = lineups[side].order;
  return order.length ? order[index % order.length] : null;
}

export function initialState(lineups: Lineups, memory: HandMemory, defaults: HandDefaults): State {
  const batterId = batterAt(lineups, 'away', 0);
  const pitcherId = lineups.home.pitcher;
  return {
    inning: 1,
    half: 'top',
    balls: 0,
    strikes: 0,
    outs: 0,
    homeScore: 0,
    awayScore: 0,
    runners: [null, null, null],
    paId: 1,
    batterId,
    pitcherId,
    catcherId: lineups.home.catcher,
    fielders: { ...lineups.home.fielders },
    pitcherHand: hand(pitcherId, 'throws', memory, defaults),
    batterSide: hand(batterId, 'bats', memory, defaults),
    next: { home: 0, away: 0 },
  };
}

/** The PA result implied by a pitch, to pre-fill (4th ball, 3rd strike, hit by pitch). */
export function suggestPaResult(s: Pick<State, 'balls' | 'strikes'>, result: Result): PaResult | null {
  if (result === 'ball' && s.balls === 3) return 'BB';
  if (STRIKE_RESULTS.includes(result) && s.strikes === 2) return 'K';
  if (result === 'hbp') return 'HBP';
  return null;
}

export function makeRow(gameId: string, pitchId: number, s: State, e: Entry): PitchRow {
  if (!s.batterId || !s.pitcherId) throw new Error('batter and pitcher must be set');
  const pitch = e.kind === 'pitch' ? e : null;
  const inPlay = pitch?.result === 'in_play';
  return {
    game_id: gameId,
    pitch_id: pitchId,
    inning: s.inning,
    half: s.half,
    pa_id: s.paId,
    pitcher_id: s.pitcherId,
    batter_id: s.batterId,
    catcher_id: s.catcherId,
    fielder_3: s.fielders[3] ?? null,
    fielder_4: s.fielders[4] ?? null,
    fielder_5: s.fielders[5] ?? null,
    fielder_6: s.fielders[6] ?? null,
    fielder_7: s.fielders[7] ?? null,
    fielder_8: s.fielders[8] ?? null,
    fielder_9: s.fielders[9] ?? null,
    pitcher_hand: s.pitcherHand,
    batter_side: s.batterSide,
    home_score: s.homeScore,
    away_score: s.awayScore,
    balls: s.balls,
    strikes: s.strikes,
    outs: s.outs,
    runner_1: s.runners[0],
    runner_2: s.runners[1],
    runner_3: s.runners[2],
    velo: pitch?.velo ?? null,
    pitch_type: pitch?.pitchType ?? null,
    pitch_type_source: pitch?.pitchType ? pitch.pitchTypeSource : null,
    zone: pitch?.zone ?? null,
    result: pitch?.result ?? null,
    event: e.kind === 'event' ? e.event : null,
    bb_type: inPlay ? pitch!.bbType : null,
    field_x: inPlay ? pitch!.fieldX : null,
    field_y: inPlay ? pitch!.fieldY : null,
    fielder_pos: inPlay ? pitch!.fielderPos : null,
    contact_quality: inPlay ? pitch!.contact : null,
    pa_result: pitch?.paResult ?? null,
    rbi: null,
    vod_ts: e.vodTs,
    notes: e.notes,
  };
}

/** Move every runner `n` bases; returns how many scored. */
function advanceAll(bases: Bases, n: number): number {
  let scored = 0;
  for (let i = 2; i >= 0; i--) {
    if (!bases[i]) continue;
    const to = i + n;
    if (to > 2) scored++;
    else bases[to] = bases[i];
    bases[i] = null;
  }
  return scored;
}

/** Put the batter on first, pushing forced runners; returns how many scored. */
function forceBatter(bases: Bases, batter: string): number {
  let scored = 0;
  if (bases[0]) {
    if (bases[1]) {
      if (bases[2]) scored++;
      bases[2] = bases[1];
    }
    bases[1] = bases[0];
  }
  bases[0] = batter;
  return scored;
}

/** Lead runner who has an open base ahead (the default runner for SB / CS). */
function stealingRunner(bases: Bases): number {
  for (let i = 2; i >= 0; i--) if (bases[i] && (i === 2 || !bases[i + 1])) return i;
  return -1;
}

function leadRunner(bases: Bases): number {
  for (let i = 2; i >= 0; i--) if (bases[i]) return i;
  return -1;
}

/**
 * Put a player already in the game at a position (1 = pitcher, 2 = catcher, 3-9) on the fielding team.
 * Whoever held that position takes the mover's old spot, so a pitcher and fielder trading places is one change.
 * Updates both the state and the lineup, so the change lasts past the half-inning.
 */
export function movePlayer(lineup: Lineup, state: State, pos: number, id: string | null): { lineup: Lineup; state: State } {
  const l: Lineup = { ...lineup, fielders: { ...lineup.fielders } };
  const s: State = { ...state, fielders: { ...state.fielders } };
  const at = (p: number) => (p === 1 ? s.pitcherId : p === 2 ? s.catcherId : s.fielders[p] ?? null);
  const put = (p: number, v: string | null) => {
    if (p === 1) l.pitcher = s.pitcherId = v;
    else if (p === 2) l.catcher = s.catcherId = v;
    else l.fielders[p] = s.fielders[p] = v;
  };
  const from = id ? [1, 2, ...FIELD_POSITIONS].find((p) => p !== pos && at(p) === id) : undefined;
  const displaced = at(pos);
  put(pos, id);
  if (from !== undefined) put(from, displaced);
  return { lineup: l, state: s };
}

/** Default effect of a row on runners, outs and runs. The charter corrects anything unusual. */
export function playOutcome(row: PitchRow): { runners: Bases; outs: number; runs: number } {
  const bases: Bases = [row.runner_1, row.runner_2, row.runner_3];
  let outs = row.outs;
  let runs = 0;
  if (row.event) {
    const i = row.event === 'pickoff' ? (bases[0] ? 0 : leadRunner(bases)) : stealingRunner(bases);
    switch (row.event) {
      case 'SB':
        if (i === 2) runs++;
        else if (i >= 0) bases[i + 1] = bases[i];
        if (i >= 0) bases[i] = null;
        break;
      case 'CS':
      case 'pickoff':
        if (i >= 0) {
          bases[i] = null;
          outs++;
        }
        break;
      case 'WP':
      case 'PB':
      case 'BK':
        runs += advanceAll(bases, 1);
        break;
    }
  } else {
    switch (row.pa_result) {
      case 'BB':
      case 'HBP':
        runs += forceBatter(bases, row.batter_id);
        break;
      case '1B':
      case 'E':
        runs += advanceAll(bases, 1);
        bases[0] = row.batter_id;
        break;
      case '2B':
        runs += advanceAll(bases, 2);
        bases[1] = row.batter_id;
        break;
      case '3B':
        runs += advanceAll(bases, 3);
        bases[2] = row.batter_id;
        break;
      case 'HR':
        runs += advanceAll(bases, 3) + 1;
        break;
      case 'K':
      case 'out':
        outs++;
        break;
      case 'SF':
        outs++;
        if (bases[2]) {
          runs++;
          bases[2] = null;
        }
        break;
      case 'SH':
        outs++;
        runs += advanceAll(bases, 1);
        break;
      case 'DP': {
        outs += 2;
        const i = bases[0] ? 0 : leadRunner(bases);
        if (i >= 0) bases[i] = null;
        break;
      }
      case 'FC': {
        outs++;
        const i = bases[0] ? 0 : leadRunner(bases);
        if (i >= 0) bases[i] = null;
        runs += forceBatter(bases, row.batter_id);
        break;
      }
    }
  }
  // Runs on a play that makes the third out do not count (true for force outs and the batter;
  // a time play where the run beats the tag is rare and the charter can fix the score).
  if (outs >= 3) runs = 0;
  return { runners: bases, outs: Math.min(outs, 3), runs };
}

/** State before the next entry, given the state the row was entered in. */
export function advance(prev: State, row: PitchRow, lineups: Lineups, memory: HandMemory, defaults: HandDefaults): State {
  const bat = battingSide(row.half);
  let { balls, strikes } = row;
  const paEnded = row.pa_result !== null;
  if (!row.event && !paEnded) {
    if (row.result === 'ball') balls = Math.min(balls + 1, 3);
    else if (row.result && STRIKE_RESULTS.includes(row.result)) strikes = Math.min(strikes + 1, 2);
    else if (row.result === 'foul' && strikes < 2) strikes++;
    // foul_tip: the game does not count it as a strike (charting guide)
  }
  const { runners, outs, runs } = playOutcome(row);
  const next = { ...prev.next };
  let paId = row.pa_id;
  if (paEnded) {
    balls = strikes = 0;
    next[bat] = next[bat] + 1;
    paId++;
  }

  let { inning, half } = row;
  let bases = runners;
  let outsNow = outs;
  const halfOver = outs >= 3;
  if (halfOver) {
    if (!paEnded) paId++; // inning ended on the bases: this batter leads off next time
    balls = strikes = 0;
    outsNow = 0;
    bases = [null, null, null];
    if (half === 'bot') inning++;
    half = half === 'top' ? 'bot' : 'top';
  }

  const newBat = battingSide(half);
  const fld = fieldingSide(half);
  const samePa = !paEnded && !halfOver;
  const batterId = samePa ? row.batter_id : batterAt(lineups, newBat, next[newBat]);
  const pitcherId = halfOver ? lineups[fld].pitcher : row.pitcher_id;
  const catcherId = halfOver ? lineups[fld].catcher : row.catcher_id;
  const fielders = halfOver ? { ...lineups[fld].fielders } : fieldersOf(row);
  return {
    inning,
    half,
    balls,
    strikes,
    outs: outsNow,
    homeScore: row.home_score + (bat === 'home' ? runs : 0),
    awayScore: row.away_score + (bat === 'away' ? runs : 0),
    runners: bases,
    paId,
    batterId,
    pitcherId,
    catcherId,
    fielders,
    pitcherHand: pitcherId === row.pitcher_id ? row.pitcher_hand : hand(pitcherId, 'throws', memory, defaults),
    batterSide: samePa ? row.batter_side : hand(batterId, 'bats', memory, defaults),
    next,
  };
}

/** Record the hands used on this row so the player's next appearance starts with them. */
export function remember(memory: HandMemory, row: PitchRow): HandMemory {
  const out = { ...memory };
  if (row.pitcher_hand) out[row.pitcher_id] = { ...out[row.pitcher_id], throws: row.pitcher_hand };
  if (row.batter_side) out[row.batter_id] = { ...out[row.batter_id], bats: row.batter_side };
  return out;
}

/** Batting orders, pitchers and catchers as they stand at the end of existing rows (for resuming a game). */
export function inferLineups(rows: PitchRow[]): Lineups {
  const lineups: Lineups = {
    home: { order: [], pitcher: null, catcher: null, fielders: {}, dh: null },
    away: { order: [], pitcher: null, catcher: null, fielders: {}, dh: null },
  };
  for (const r of rows) {
    const bat = lineups[battingSide(r.half)];
    if (!bat.order.includes(r.batter_id)) bat.order.push(r.batter_id);
    const fld = lineups[fieldingSide(r.half)];
    fld.pitcher = r.pitcher_id;
    fld.catcher = r.catcher_id ?? fld.catcher;
    for (const p of FIELD_POSITIONS) fld.fielders[p] = r[`fielder_${p}`] ?? fld.fielders[p] ?? null;
  }
  // A batter who never fielded while the pitcher was not in the order is the DH.
  for (const l of Object.values(lineups)) {
    const fielding = new Set([l.pitcher, l.catcher, ...Object.values(l.fielders)]);
    if (l.pitcher && !l.order.includes(l.pitcher) && Object.values(l.fielders).some(Boolean))
      l.dh = l.order.find((id) => !fielding.has(id)) ?? null;
  }
  return lineups;
}

/** Rebuild the pending state after the last row, for continuing a saved or imported game. */
export function resume(rows: PitchRow[], lineups: Lineups, memory: HandMemory, defaults: HandDefaults): State {
  if (!rows.length) return initialState(lineups, memory, defaults);
  const last = rows[rows.length - 1];
  const next: Record<Side, number> = { home: 0, away: 0 };
  for (const side of ['home', 'away'] as Side[]) {
    const lastBat = [...rows].reverse().find((r) => battingSide(r.half) === side);
    if (!lastBat) continue;
    const idx = Math.max(0, lineups[side].order.indexOf(lastBat.batter_id));
    // For the row being advanced, `advance` itself moves to the next batter if the PA ended.
    next[side] = lastBat === last || lastBat.pa_result === null ? idx : idx + 1;
  }
  const prev: State = {
    inning: last.inning,
    half: last.half,
    balls: last.balls,
    strikes: last.strikes,
    outs: last.outs,
    homeScore: last.home_score,
    awayScore: last.away_score,
    runners: [last.runner_1, last.runner_2, last.runner_3],
    paId: last.pa_id,
    batterId: last.batter_id,
    pitcherId: last.pitcher_id,
    catcherId: last.catcher_id,
    fielders: fieldersOf(last),
    pitcherHand: last.pitcher_hand,
    batterSide: last.batter_side,
    next,
  };
  return advance(prev, last, lineups, memory, defaults);
}

export interface Issue {
  pitchId: number | null;
  message: string;
}

/** The export checks from docs/charting-guide.md ("Before you export"). */
export function checkGame(rows: PitchRow[], opts: { lite: boolean; final: { home: number; away: number } | null }): Issue[] {
  const issues: Issue[] = [];
  const byPa = new Map<number, PitchRow[]>();
  for (const r of rows) {
    byPa.set(r.pa_id, [...(byPa.get(r.pa_id) ?? []), r]);
    // 2. Every ball in play has a ball type and a fielder.
    if (r.result === 'in_play') {
      if (r.fielder_pos === null) issues.push({ pitchId: r.pitch_id, message: 'ball in play has no fielder' });
      if (!opts.lite && r.bb_type === null) issues.push({ pitchId: r.pitch_id, message: 'ball in play has no ball type' });
    }
    // 3. Counts never pass 3 balls or 2 strikes.
    if (r.balls > 3 || r.strikes > 2) issues.push({ pitchId: r.pitch_id, message: `count ${r.balls}-${r.strikes} is impossible` });
  }
  // 1. Every at-bat has an outcome.
  for (const pa of byPa.values()) {
    const last = pa[pa.length - 1];
    const cut = last.event !== null && PA_CUT_EVENTS.includes(last.event) && playOutcome(last).outs >= 3;
    if (last.pa_result === null && !cut) issues.push({ pitchId: last.pitch_id, message: 'at-bat has no outcome' });
  }
  // 4. Each half-inning ends at 3 outs (the game's last half may end early on a walk-off).
  rows.forEach((r, i) => {
    const nxt = rows[i + 1];
    if (!nxt || (nxt.inning === r.inning && nxt.half === r.half)) return;
    const outs = playOutcome(r).outs;
    if (outs < 3) issues.push({ pitchId: r.pitch_id, message: `half-inning ends with ${outs} out${outs === 1 ? '' : 's'}` });
  });
  // 5. Runs in the file match the final score.
  if (opts.final && rows.length) {
    const last = rows[rows.length - 1];
    const { runs } = playOutcome(last);
    const home = last.home_score + (last.half === 'bot' ? runs : 0);
    const away = last.away_score + (last.half === 'top' ? runs : 0);
    if (home !== opts.final.home || away !== opts.final.away)
      issues.push({ pitchId: null, message: `charted score is ${home}-${away} (home-away), final score entered is ${opts.final.home}-${opts.final.away}` });
  }
  return issues;
}
