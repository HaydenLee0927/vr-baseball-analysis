import { describe, expect, it } from 'vitest';
import {
  advance,
  checkGame,
  inferLineups,
  initialState,
  makeRow,
  movePlayer,
  remember,
  resume,
  suggestPaResult,
  type Entry,
  type HandMemory,
  type Lineups,
  type PaResult,
  type PitchRow,
  type Result,
  type State,
} from './engine';

const lineups = (): Lineups => ({
  home: { order: ['h1', 'h2', 'h3'], pitcher: 'hp', catcher: 'hc', fielders: { 3: 'h1', 6: 'h2', 8: 'h3' }, dh: null },
  away: { order: ['a1', 'a2', 'a3'], pitcher: 'ap', catcher: 'ac', fielders: { 3: 'a1', 6: 'a2', 8: 'a3' }, dh: null },
});

function pitch(result: Result, paResult: PaResult | null = null, extra: Partial<Entry> = {}): Entry {
  return {
    kind: 'pitch', velo: 110, pitchType: null, pitchTypeSource: null, zone: 5, result,
    bbType: result === 'in_play' ? 'ground' : null, fieldX: null, fieldY: null,
    fielderPos: result === 'in_play' ? 6 : null, contact: null, paResult, vodTs: null, notes: null,
    ...extra,
  } as Entry;
}

/** Play entries through the engine the way the UI does: row from state, then advance. */
function play(entries: Entry[], l = lineups(), start?: State) {
  let memory: HandMemory = {};
  let state = start ?? initialState(l, memory, {});
  const rows: PitchRow[] = [];
  for (const e of entries) {
    const row = makeRow('g', rows.length + 1, state, e);
    rows.push(row);
    memory = remember(memory, row);
    state = advance(state, row, l, memory, {});
  }
  return { rows, state };
}

const strikeout = (): Entry[] => [pitch('called_strike'), pitch('swinging_strike'), pitch('swinging_strike', 'K')];
const groundout = (): Entry[] => [pitch('in_play', 'out')];

describe('count', () => {
  it('counts balls and strikes, fouls stop at two strikes, foul tips do not count', () => {
    const { state } = play([pitch('ball'), pitch('called_strike'), pitch('foul'), pitch('foul'), pitch('foul_tip')]);
    expect([state.balls, state.strikes, state.paId]).toEqual([1, 2, 1]);
  });

  it('suggests BB on ball four, K on strike three, HBP', () => {
    expect(suggestPaResult({ balls: 3, strikes: 0 }, 'ball')).toBe('BB');
    expect(suggestPaResult({ balls: 0, strikes: 2 }, 'swinging_strike')).toBe('K');
    expect(suggestPaResult({ balls: 0, strikes: 2 }, 'foul')).toBeNull();
    expect(suggestPaResult({ balls: 0, strikes: 0 }, 'hbp')).toBe('HBP');
  });
});

describe('plate appearances and runners', () => {
  it('a walk forces runners and the next batter comes up', () => {
    const walk = [pitch('ball'), pitch('ball'), pitch('ball'), pitch('ball', 'BB')];
    const { state, rows } = play([...walk, ...walk]);
    expect(state.runners).toEqual(['a2', 'a1', null]);
    expect(state.batterId).toBe('a3');
    expect(rows.map((r) => r.pa_id)).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
    expect([state.balls, state.strikes, state.paId]).toEqual([0, 0, 3]);
  });

  it('a single moves runners one base and a double scores from second', () => {
    const { state } = play([pitch('in_play', '1B'), pitch('in_play', '1B'), pitch('in_play', '2B')]);
    expect(state.runners).toEqual([null, 'a3', 'a2']);
    expect(state.awayScore).toBe(1);
  });

  it('a home run clears the bases', () => {
    const { state } = play([pitch('hbp', 'HBP'), pitch('in_play', 'HR')]);
    expect(state.runners).toEqual([null, null, null]);
    expect(state.awayScore).toBe(2);
  });

  it('a sacrifice fly scores the runner from third', () => {
    const { state } = play([pitch('in_play', '3B'), pitch('in_play', 'SF')]);
    expect([state.awayScore, state.outs, state.runners[2]]).toEqual([1, 1, null]);
  });

  it('a double play removes the runner on first', () => {
    const { state } = play([pitch('in_play', '1B'), pitch('in_play', 'DP')]);
    expect([state.outs, state.runners]).toEqual([2, [null, null, null]]);
  });

  it('a fielder\'s choice puts the batter on first and the runner out', () => {
    const { state } = play([pitch('in_play', '1B'), pitch('in_play', 'FC')]);
    expect([state.outs, state.runners]).toEqual([1, ['a2', null, null]]);
  });

  it('stolen base, wild pitch and caught stealing', () => {
    const steal: Entry = { kind: 'event', event: 'SB', vodTs: null, notes: null };
    const wp: Entry = { kind: 'event', event: 'WP', vodTs: null, notes: null };
    const cs: Entry = { kind: 'event', event: 'CS', vodTs: null, notes: null };
    const { state, rows } = play([pitch('in_play', '1B'), steal, pitch('ball'), wp, pitch('in_play', '1B'), cs]);
    expect(rows.find((r) => r.event === 'SB')!.pa_id).toBe(2); // events belong to the PA in progress
    // a1 singles, steals second, goes to third on the wild pitch, scores on a2's single; a2 is caught stealing.
    expect(state.awayScore).toBe(1);
    expect([state.outs, state.runners]).toEqual([1, [null, null, null]]);
  });

  it('a balk moves every runner up and keeps the count', () => {
    const balk: Entry = { kind: 'event', event: 'BK', vodTs: null, notes: null };
    const { state } = play([pitch('in_play', '1B'), pitch('in_play', '3B'), pitch('ball'), balk]);
    // a1 scores from third on the triple; a2 on third scores on the balk.
    expect([state.awayScore, state.runners]).toEqual([2, [null, null, null]]);
    expect([state.balls, state.strikes, state.batterId]).toEqual([1, 0, 'a3']);
  });
});

describe('half-innings', () => {
  it('three outs switch sides, keep the batting order and change pitcher', () => {
    const { state } = play([...strikeout(), ...groundout(), ...groundout()]);
    expect([state.inning, state.half, state.outs]).toEqual([1, 'bot', 0]);
    expect([state.batterId, state.pitcherId, state.catcherId]).toEqual(['h1', 'ap', 'ac']);
    expect(state.next.away).toBe(3); // a1..a3 batted; index 3 wraps to a1
    const after = play([...groundout(), ...groundout(), ...groundout()], lineups(), state).state;
    expect([after.inning, after.half, after.batterId]).toEqual([2, 'top', 'a1']);
  });

  it('a fielder comes in to pitch and the pitcher takes his spot, lasting past the half-inning', () => {
    const l = lineups();
    const start = initialState(l, {}, {});
    const swap = movePlayer(l.home, start, 1, 'h2'); // shortstop h2 pitches, hp goes to short
    expect([swap.state.pitcherId, swap.state.fielders[6]]).toEqual(['h2', 'hp']);
    expect([swap.lineup.pitcher, swap.lineup.fielders[6]]).toEqual(['h2', 'hp']);
    const l2 = { ...l, home: swap.lineup };
    const top = play([...groundout(), ...groundout(), ...groundout()], l2, swap.state).state;
    const back = play([...groundout(), ...groundout(), ...groundout()], l2, top).state;
    expect([back.half, back.pitcherId, back.fielders[6]]).toEqual(['top', 'h2', 'hp']);
  });

  it('every row records the defense, which changes with the half-inning', () => {
    const { rows, state } = play([...groundout(), ...groundout(), ...groundout(), ...groundout()]);
    expect([rows[0].fielder_3, rows[0].fielder_6, rows[0].fielder_8, rows[0].fielder_4]).toEqual(['h1', 'h2', 'h3', null]);
    expect([rows[3].half, rows[3].fielder_3, rows[3].fielder_6]).toEqual(['bot', 'a1', 'a2']);
    expect(state.fielders[8]).toBe('a3');
  });

  it('a mid-inning defensive change carries to the next pitch', () => {
    const l = lineups();
    const start = { ...initialState(l, {}, {}), fielders: { ...l.home.fielders, 7: 'h9' } };
    const { rows } = play([pitch('ball'), pitch('ball')], l, start);
    expect(rows.map((r) => r.fielder_7)).toEqual(['h9', 'h9']);
  });

  it('runs on the third out do not count', () => {
    const { state } = play([pitch('in_play', '3B'), ...groundout(), ...groundout(), pitch('in_play', 'out')]);
    expect(state.awayScore).toBe(0);
  });

  it('caught stealing for the third out: the batter leads off the next inning', () => {
    const cs: Entry = { kind: 'event', event: 'CS', vodTs: null, notes: null };
    const top = play([...groundout(), ...groundout(), pitch('in_play', '1B'), pitch('ball'), cs]);
    expect(top.state.half).toBe('bot');
    const bot = play([...groundout(), ...groundout(), ...groundout()], lineups(), top.state);
    // a1 and a2 ground out, a3 singles, a1 is up again when a3 is caught stealing.
    expect(bot.state.batterId).toBe('a1');
  });
});

describe('hands', () => {
  it('a player keeps the hand they last used', () => {
    const l = lineups();
    let memory: HandMemory = {};
    let state: State = { ...initialState(l, memory, {}), pitcherHand: 'L' };
    const row = makeRow('g', 1, state, pitch('in_play', 'out'));
    memory = remember(memory, row);
    state = advance(state, row, l, memory, {});
    expect(state.pitcherHand).toBe('L');
    expect(initialState(l, {}, { hp: { throws: 'R' } }).pitcherHand).toBe('R');
    expect(initialState(l, {}, { hp: { throws: 'S' } }).pitcherHand).toBeNull();
  });
});

describe('resume', () => {
  it('rebuilds lineups and the next state from saved rows', () => {
    const { rows, state } = play([...strikeout(), pitch('in_play', '1B'), pitch('ball')]);
    const l = inferLineups(rows);
    expect(l.away.order).toEqual(['a1', 'a2', 'a3']);
    expect(l.home.pitcher).toBe('hp');
    expect(l.home.fielders).toMatchObject({ 3: 'h1', 6: 'h2', 8: 'h3' });
    const resumed = resume(rows, l, {}, {});
    expect({ ...resumed, next: null }).toEqual({ ...state, next: null });
    expect(resumed.batterId).toBe('a3');
  });
});

describe('designated hitter', () => {
  it('a batter who never fields while the pitcher does not bat is found as the DH', () => {
    const l = lineups();
    l.home = { order: ['h1', 'h2', 'hd'], pitcher: 'hp', catcher: 'h2', fielders: { 3: 'h1' }, dh: 'hd' };
    const { rows } = play([...groundout(), ...groundout(), ...groundout(), ...groundout(), ...groundout(), ...groundout()], l);
    expect(inferLineups(rows).home.dh).toBe('hd');
    expect(inferLineups(rows).away.dh).toBeNull(); // every away batter also fields
  });
});

describe('export checks', () => {
  it('passes a clean half-inning and flags problems', () => {
    const { rows } = play([...strikeout(), ...groundout(), ...groundout(), ...groundout()]);
    expect(checkGame(rows, { lite: false, final: { home: 0, away: 0 } })).toEqual([]);

    const broken = rows.map((r) => ({ ...r }));
    broken[2].pa_result = null; // strikeout without K
    broken[3].bb_type = null;
    const messages = checkGame(broken, { lite: false, final: { home: 1, away: 0 } }).map((i) => i.message);
    expect(messages).toContain('at-bat has no outcome');
    expect(messages).toContain('ball in play has no ball type');
    expect(messages.some((m) => m.startsWith('charted score is 0-0'))).toBe(true);
    expect(checkGame(broken, { lite: true, final: null }).map((i) => i.message)).toEqual(['at-bat has no outcome']);
  });

  it('flags a half-inning that ends short of three outs', () => {
    const { rows } = play([...groundout(), ...groundout(), ...groundout(), ...groundout()]);
    const short = rows.filter((_, i) => i !== 2); // drop the third out
    short[2] = { ...short[2], inning: 1, half: 'bot' };
    expect(checkGame(short, { lite: false, final: null }).map((i) => i.message)).toContain('half-inning ends with 2 outs');
  });
});
