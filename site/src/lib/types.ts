// Shapes of the JSON files written by pipeline/export_json.py.

import type { PitchRec } from './charts';

export type Hand = 'L' | 'R' | 'S' | null;
export type Role = 'batting' | 'pitching';
/** A stat line: counts and rates keyed by stat id (see pipeline/build_stats.py). */
export type Line = Record<string, number | string | null>;

export interface Person {
  id: string;
  slug: string;
  name: string;
  vrchat_name: string;
  romanized: string;
  bats: Hand;
  throws: Hand;
}

export interface PlayerIndexRow extends Person {
  season: string;
  team_ids: string[];
  batting: Line | null;
  pitching: Line | null;
}

export interface Split extends Line {
  key: string;
}

/** Percentile ranks among qualified players of the season (detailed games only). */
export interface Percentiles {
  pool: number;
  qualified: boolean;
  stats: { key: string; value: number | null; den: number | null; pct: number | null }[];
}

export interface SeasonLine {
  season: string;
  team_ids: string[];
  batting: Line | null;
  pitching: Line | null;
  splits: { batting: Split[]; pitching: Split[] };
  percentiles: { batting: Percentiles | null; pitching: Percentiles | null };
}

export interface GameRef {
  game_id: string;
  season: string;
  date: string | null;
  label: string | null;
}

export interface GameLogRow extends GameRef {
  opponent: string;
  [stat: string]: number | string | null | string[];
}

export interface PlayerFile {
  player: Person;
  seasons: SeasonLine[];
  game_log: { batting: GameLogRow[]; pitching: GameLogRow[] };
  /** Pitch-level rows from detailed games only, for the charts. */
  pitches: { as_batter: PitchRec[]; as_pitcher: PitchRec[] };
}

export interface Team {
  team_id: string;
  name: string;
  rosters: Record<string, string[]>;
}

export interface GameSummary extends GameRef {
  home_team_id: string;
  away_team_id: string;
  chart_status: 'partial' | 'complete';
  pitches: number;
  /** Charted in the charting tool (all fields), as opposed to a legacy import. */
  detailed: boolean;
  home_score?: number;
  away_score?: number;
  innings?: number;
}

export interface League {
  seasons: Record<string, { games: number; batting: Line; pitching: Line }>;
}

export interface Meta {
  built_at: string;
  seasons: string[];
  coverage: {
    games: number;
    pitches: number;
    plate_appearances: number;
    games_per_team: Record<string, number>;
    partial_games: string[];
  };
}
