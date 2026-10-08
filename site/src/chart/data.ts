// Data from the local chart server (chart-server.ts) and the draft format kept in localStorage.

import {
  inferLineups,
  remember,
  resume,
  type HandDefaults,
  type HandMemory,
  type Lineups,
  type PitchRow,
  type State,
} from './engine';
import type { CsvValue } from './csv';

export type Rec = Record<string, string>;
export interface SchemaProp {
  type?: string | string[];
  enum?: (string | number | null)[];
  description?: string;
}
export interface ServerData {
  players: Rec[];
  aliases: Rec[];
  teams: Rec[];
  rosters: Rec[];
  games: Rec[];
  pitchTypes: Rec[];
  pitchSchema: Record<string, SchemaProp>;
  pitchFiles: string[];
}
export interface SaveResult {
  ok: boolean;
  output: string;
  file: string;
  added: { players: number; teams: number; rosters: number };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export const fetchData = () => api<ServerData>('/data');
export const fetchPitches = (gameId: string) => api<Rec[]>(`/pitches/${gameId}`);
export const saveGame = (body: unknown) =>
  api<SaveResult>('/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function isNumeric(prop: SchemaProp): boolean {
  const types = Array.isArray(prop.type) ? prop.type : prop.type ? [prop.type] : [];
  return types.includes('integer') || types.includes('number') || (prop.enum ?? []).some((v) => typeof v === 'number');
}

/** Convert a CSV record (all strings) to typed values using the schema; blank -> null. */
export function typedValue(prop: SchemaProp, raw: string): string | number | null {
  if (raw === '') return null;
  if (isNumeric(prop)) {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  return raw;
}

export function typedRow(rec: Rec, schema: Record<string, SchemaProp>): PitchRow {
  return Object.fromEntries(Object.entries(schema).map(([k, p]) => [k, typedValue(p, rec[k] ?? '')])) as unknown as PitchRow;
}

export interface GameMeta {
  game_id: string;
  season: string;
  date: string | null;
  label: string | null;
  home_team_id: string;
  away_team_id: string;
  home_final: number | null;
  away_final: number | null;
  vod_url: string | null;
  charted_by: string | null;
  chart_status: 'partial' | 'complete';
  velo_unit: 'km/h' | 'mph';
  game_version: string | null;
}

export interface NewPlayer {
  player_id: string;
  display_name: null;
  vrchat_name: string;
  slug: string;
  default_bats: null;
  default_throws: null;
}

export interface Draft {
  version: 1;
  game: GameMeta;
  /** Charting guide: "Pitch type shown on stream? yes / no / from inning N". */
  pitchTypesShown: 'yes' | 'no' | 'from';
  pitchTypesFromInning: number | null;
  lite: boolean;
  lineups: Lineups;
  newPlayers: NewPlayer[];
  newTeams: { team_id: string; display_name: null }[];
  rows: PitchRow[];
  /** State before each row, for undo. Missing for rows loaded from a CSV. */
  before: (State | null)[];
  state: State;
  memory: HandMemory;
  updatedAt: string;
  savedAt: string | null;
}

export function gameFromRecord(rec: Rec): GameMeta {
  const num = (s: string) => (s === '' ? null : Number(s));
  return {
    game_id: rec.game_id,
    season: rec.season,
    date: rec.date || null,
    label: rec.label || null,
    home_team_id: rec.home_team_id,
    away_team_id: rec.away_team_id,
    home_final: num(rec.home_final ?? ''),
    away_final: num(rec.away_final ?? ''),
    vod_url: rec.vod_url || null,
    charted_by: rec.charted_by || null,
    chart_status: rec.chart_status === 'complete' ? 'complete' : 'partial',
    velo_unit: rec.velo_unit === 'mph' ? 'mph' : 'km/h',
    game_version: rec.game_version || null,
  };
}

export function handDefaults(players: Rec[]): HandDefaults {
  return Object.fromEntries(players.map((p) => [p.player_id, { bats: p.default_bats || null, throws: p.default_throws || null }]));
}

/** Draft for a game that already has a pitches CSV in data/raw (continue or correct it). */
export function draftFromSaved(game: GameMeta, rows: PitchRow[], defaults: HandDefaults): Draft {
  const lineups = inferLineups(rows);
  const memory = rows.reduce(remember, {} as HandMemory);
  return {
    version: 1,
    game,
    pitchTypesShown: 'yes',
    pitchTypesFromInning: null,
    lite: false,
    lineups,
    newPlayers: [],
    newTeams: [],
    rows,
    before: rows.map(() => null),
    state: resume(rows, lineups, memory, defaults),
    memory,
    updatedAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
  };
}

const PREFIX = 'vrs-chart:';

export function storeDraft(d: Draft): void {
  try {
    localStorage.setItem(PREFIX + d.game.game_id, JSON.stringify(d));
  } catch {
    /* storage full or blocked: the page keeps working, but nothing is autosaved */
  }
}

export function loadDraft(gameId: string): Draft | null {
  try {
    const raw = localStorage.getItem(PREFIX + gameId);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function deleteDraft(gameId: string): void {
  try {
    localStorage.removeItem(PREFIX + gameId);
  } catch {
    /* ignore */
  }
}

export function listDrafts(): Draft[] {
  const out: Draft[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) {
        const d = loadDraft(k.slice(PREFIX.length));
        if (d) out.push(d);
      }
    }
  } catch {
    /* storage unavailable */
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Everything the server needs to write this game into data/raw. */
export function saveBody(d: Draft): Record<string, unknown> {
  const team = { home: d.game.home_team_id, away: d.game.away_team_id };
  const roster = new Map<string, Record<string, CsvValue>>();
  const add = (teamId: string, pid: string | null) => {
    if (pid) roster.set(`${teamId}|${pid}`, { season: d.game.season, team_id: teamId, player_id: pid });
  };
  for (const side of ['home', 'away'] as const) {
    d.lineups[side].order.forEach((p) => add(team[side], p));
    add(team[side], d.lineups[side].pitcher);
    add(team[side], d.lineups[side].catcher);
  }
  for (const r of d.rows) {
    const [bat, fld] = r.half === 'top' ? [team.away, team.home] : [team.home, team.away];
    [r.batter_id, r.runner_1, r.runner_2, r.runner_3].forEach((p) => add(bat, p));
    [r.pitcher_id, r.catcher_id].forEach((p) => add(fld, p));
  }
  return { game: d.game, pitches: d.rows, players: d.newPlayers, teams: d.newTeams, rosters: [...roster.values()] };
}
