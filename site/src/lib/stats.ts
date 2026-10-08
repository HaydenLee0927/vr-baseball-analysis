// Which stats each table shows. Labels and help text come from i18n/glossary.ko.ts, keyed by `id`.
// A test checks that every id here has a glossary entry.

import type { Kind } from './format';

export interface StatCol {
  /** Field in the JSON line. */
  key: string;
  /** Glossary id; defaults to `key`. */
  id?: string;
  kind: Kind;
  /** Field holding this rate's sample size, shown next to the value. */
  den?: string;
  /** For sorting: a lower value is better (from this table's point of view). */
  lowerBetter?: boolean;
}

export const glossaryId = (c: StatCol) => c.id ?? c.key;

export const HITTING_STANDARD: StatCol[] = [
  { key: 'pa', kind: 'int' },
  { key: 'ab', kind: 'int' },
  { key: 'h', kind: 'int' },
  { key: '2b', kind: 'int' },
  { key: '3b', kind: 'int' },
  { key: 'hr', kind: 'int' },
  { key: 'bb', kind: 'int' },
  { key: 'k', kind: 'int', lowerBetter: true },
  { key: 'hbp', kind: 'int' },
  { key: 'avg', kind: 'avg' },
  { key: 'obp', kind: 'avg' },
  { key: 'slg', kind: 'avg' },
  { key: 'ops', kind: 'avg' },
  { key: 'iso', kind: 'avg' },
  { key: 'babip', kind: 'avg' },
  { key: 'k_pct', kind: 'pct', lowerBetter: true },
  { key: 'bb_pct', kind: 'pct' },
];

export const HITTING_DISCIPLINE: StatCol[] = [
  { key: 'pitches', kind: 'int' },
  { key: 'swing_pct', kind: 'pct', den: 'pitches' },
  { key: 'whiff_pct', kind: 'pct', den: 'swings', lowerBetter: true },
  { key: 'contact_pct', kind: 'pct', den: 'swings' },
  { key: 'zone_swing_pct', kind: 'pct', den: 'zone_pitches' },
  { key: 'chase_pct', kind: 'pct', den: 'chase_pitches', lowerBetter: true },
  { key: 'first_pitch_swing_pct', kind: 'pct', den: 'first_pitches' },
];

export const HITTING_BATTED_BALL: StatCol[] = [
  { key: 'bip', kind: 'int' },
  { key: 'gb_pct', kind: 'pct', den: 'bb_typed' },
  { key: 'ld_pct', kind: 'pct', den: 'bb_typed' },
  { key: 'fb_pct', kind: 'pct', den: 'bb_typed' },
  { key: 'pu_pct', kind: 'pct', den: 'bb_typed' },
  { key: 'hard_pct', kind: 'pct', den: 'contact_rated' },
];

export const PITCHING_STANDARD: StatCol[] = [
  { key: 'g', kind: 'int' },
  { key: 'bf', kind: 'int' },
  { key: 'ip', kind: 'ip' },
  { key: 'r', kind: 'int', lowerBetter: true },
  { key: 'h', kind: 'int', lowerBetter: true },
  { key: 'hr', kind: 'int', lowerBetter: true },
  { key: 'bb', kind: 'int', lowerBetter: true },
  { key: 'k', kind: 'int' },
  { key: 'hbp', kind: 'int', lowerBetter: true },
  { key: 'ra9', kind: 'dec2', den: 'ip', lowerBetter: true },
  { key: 'whip', kind: 'dec2', den: 'ip', lowerBetter: true },
  { key: 'hr9', kind: 'dec2', den: 'ip', lowerBetter: true },
  { key: 'k_pct', kind: 'pct' },
  { key: 'bb_pct', kind: 'pct', lowerBetter: true },
  { key: 'k_bb_pct', kind: 'pct' },
  { key: 'opp_avg', kind: 'avg', lowerBetter: true },
  { key: 'opp_obp', kind: 'avg', lowerBetter: true },
  { key: 'opp_slg', kind: 'avg', lowerBetter: true },
  { key: 'opp_ops', kind: 'avg', lowerBetter: true },
];

export const PITCHING_STUFF: StatCol[] = [
  { key: 'pitches', kind: 'int' },
  { key: 'velo_avg', kind: 'dec1', den: 'velo_n' },
  { key: 'velo_max', kind: 'dec1' },
  { key: 'whiff_pct', kind: 'pct', den: 'swings' },
  { key: 'called_strike_pct', kind: 'pct', den: 'pitches' },
  { key: 'csw_pct', kind: 'pct', den: 'pitches' },
  { key: 'zone_pct', kind: 'pct', den: 'zone_charted' },
  { key: 'first_pitch_strike_pct', kind: 'pct', den: 'first_pitches' },
  { key: 'gb_pct', kind: 'pct', den: 'bb_typed' },
  { key: 'hard_pct', kind: 'pct', den: 'contact_rated', lowerBetter: true },
];

/** Split rows: results of PAs that ended in the situation, discipline on pitches thrown in it. */
export function splitColumns(role: 'batting' | 'pitching'): StatCol[] {
  const p = role === 'pitching';
  return [
    { key: 'pa', kind: 'int' },
    { key: 'avg', id: p ? 'opp_avg' : 'avg', kind: 'avg', lowerBetter: p },
    { key: 'obp', id: p ? 'opp_obp' : 'obp', kind: 'avg', lowerBetter: p },
    { key: 'slg', id: p ? 'opp_slg' : 'slg', kind: 'avg', lowerBetter: p },
    { key: 'ops', id: p ? 'opp_ops' : 'ops', kind: 'avg', lowerBetter: p },
    { key: 'k_pct', kind: 'pct', lowerBetter: !p },
    { key: 'bb_pct', kind: 'pct', lowerBetter: p },
    { key: 'pitches', kind: 'int' },
    { key: 'swing_pct', kind: 'pct', den: 'pitches' },
    { key: 'whiff_pct', kind: 'pct', den: 'swings', lowerBetter: !p },
    { key: 'chase_pct', kind: 'pct', den: 'chase_pitches', lowerBetter: !p },
  ];
}

export const HITTING_GAME_LOG: StatCol[] = [
  { key: 'pa', kind: 'int' },
  { key: 'ab', kind: 'int' },
  { key: 'h', kind: 'int' },
  { key: '2b', kind: 'int' },
  { key: '3b', kind: 'int' },
  { key: 'hr', kind: 'int' },
  { key: 'bb', kind: 'int' },
  { key: 'k', kind: 'int' },
  { key: 'hbp', kind: 'int' },
];

export const PITCHING_GAME_LOG: StatCol[] = [
  { key: 'ip', kind: 'ip' },
  { key: 'bf', kind: 'int' },
  { key: 'h', kind: 'int' },
  { key: 'r', kind: 'int' },
  { key: 'hr', kind: 'int' },
  { key: 'bb', kind: 'int' },
  { key: 'k', kind: 'int' },
  { key: 'pitches', kind: 'int' },
  { key: 'velo_max', kind: 'dec1' },
];

export const HITTING_LEADERBOARD: StatCol[] = [
  { key: 'pa', kind: 'int' },
  { key: 'avg', kind: 'avg' },
  { key: 'obp', kind: 'avg' },
  { key: 'slg', kind: 'avg' },
  { key: 'ops', kind: 'avg' },
  { key: 'hr', kind: 'int' },
  { key: 'k_pct', kind: 'pct', lowerBetter: true },
  { key: 'bb_pct', kind: 'pct' },
  { key: 'whiff_pct', kind: 'pct', den: 'swings', lowerBetter: true },
  { key: 'chase_pct', kind: 'pct', den: 'chase_pitches', lowerBetter: true },
];

export const PITCHING_LEADERBOARD: StatCol[] = [
  { key: 'g', kind: 'int' },
  { key: 'ip', kind: 'ip' },
  { key: 'bf', kind: 'int' },
  { key: 'ra9', kind: 'dec2', lowerBetter: true },
  { key: 'whip', kind: 'dec2', lowerBetter: true },
  { key: 'k_pct', kind: 'pct' },
  { key: 'bb_pct', kind: 'pct', lowerBetter: true },
  { key: 'k_bb_pct', kind: 'pct' },
  { key: 'whiff_pct', kind: 'pct', den: 'swings' },
  { key: 'csw_pct', kind: 'pct', den: 'pitches' },
  { key: 'velo_avg', kind: 'dec1', den: 'velo_n' },
];

/** Every column the site shows, per role, for the glossary coverage test. */
export const ALL_COLUMNS: { role: 'batting' | 'pitching'; cols: StatCol[] }[] = [
  { role: 'batting', cols: [...HITTING_STANDARD, ...HITTING_DISCIPLINE, ...HITTING_BATTED_BALL, ...splitColumns('batting'), ...HITTING_GAME_LOG, ...HITTING_LEADERBOARD] },
  { role: 'pitching', cols: [...PITCHING_STANDARD, ...PITCHING_STUFF, ...splitColumns('pitching'), ...PITCHING_GAME_LOG, ...PITCHING_LEADERBOARD] },
];
