// Vite plugin for the local charting tool (`npm run chart` only; never part of the production build).
// Reads players/teams/games from data/raw and saves charted games back into it, then runs the
// Python validator so the charter sees the same errors CI would.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { parseCsv, toCsv, type CsvValue } from './src/chart/csv';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const SCHEMA = join(ROOT, 'data', 'schema');
const ID = /^[a-z0-9][a-z0-9_-]*$/;

type Row = Record<string, CsvValue>;

function readCsv(path: string): Record<string, string>[] {
  return existsSync(path) ? parseCsv(readFileSync(path, 'utf-8')) : [];
}

function schema(table: string): { properties: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(SCHEMA, `${table}.schema.json`), 'utf-8'));
}

function writeTable(path: string, table: string, rows: Row[]): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, toCsv(Object.keys(schema(table).properties), rows), 'utf-8');
}

function appendMissing(file: string, table: string, rows: Row[], key: (r: Row) => string): Row[] {
  const existing: Row[] = readCsv(join(RAW, file));
  const keys = new Set(existing.map(key));
  const added = rows.filter((r) => !keys.has(key(r)));
  if (added.length) writeTable(join(RAW, file), table, [...existing, ...added]);
  return added;
}

function loadData() {
  if (!existsSync(join(RAW, 'players.csv'))) throw new Error(`No data in ${RAW}. Clone the data repo there first (see README).`);
  const pitchDir = join(RAW, 'pitches');
  return {
    players: readCsv(join(RAW, 'players.csv')),
    aliases: readCsv(join(RAW, 'player_aliases.csv')),
    teams: readCsv(join(RAW, 'teams.csv')),
    rosters: readCsv(join(RAW, 'rosters.csv')),
    games: readCsv(join(RAW, 'games.csv')),
    pitchTypes: readCsv(join(SCHEMA, 'pitch_types.csv')),
    pitchSchema: schema('pitches').properties,
    pitchFiles: existsSync(pitchDir) ? readdirSync(pitchDir).filter((f) => f.endsWith('.csv')).map((f) => f.slice(0, -4)) : [],
  };
}

interface SaveBody {
  game: Row;
  pitches: Row[];
  players: Row[];
  teams: Row[];
  rosters: Row[];
}

function save(body: SaveBody) {
  const gameId = String(body.game.game_id ?? '');
  if (!ID.test(gameId)) throw new Error(`invalid game_id ${JSON.stringify(gameId)}`);
  for (const p of body.players) if (!ID.test(String(p.player_id))) throw new Error(`invalid player_id ${p.player_id}`);

  const existingPlayers = readCsv(join(RAW, 'players.csv'));
  for (const p of body.players) {
    const clash = existingPlayers.find((e) => e.player_id === p.player_id && e.vrchat_name !== p.vrchat_name);
    if (clash) throw new Error(`player_id ${p.player_id} already belongs to ${clash.vrchat_name}`);
  }

  writeTable(join(RAW, 'pitches', `${gameId}.csv`), 'pitches', body.pitches);
  const games: Row[] = readCsv(join(RAW, 'games.csv'));
  const at = games.findIndex((g) => g.game_id === gameId);
  if (at >= 0) games[at] = body.game;
  else games.push(body.game);
  writeTable(join(RAW, 'games.csv'), 'games', games);
  const added = {
    players: appendMissing('players.csv', 'players', body.players, (r) => String(r.player_id)).length,
    teams: appendMissing('teams.csv', 'teams', body.teams, (r) => String(r.team_id)).length,
    rosters: appendMissing('rosters.csv', 'rosters', body.rosters, (r) => `${r.season}|${r.team_id}|${r.player_id}`).length,
  };

  const py = spawnSync(process.env.PYTHON ?? 'python', ['pipeline/validate.py'], {
    cwd: ROOT,
    encoding: 'utf-8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  const output = py.error ? `could not run python: ${py.error.message}` : `${py.stdout}${py.stderr}`;
  return { ok: py.status === 0, output, added, file: `data/raw/pitches/${gameId}.csv` };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

function send(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export function chartServer(): Plugin {
  return {
    name: 'vr-savant-chart-server',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://local');
          if (req.method === 'GET' && url.pathname === '/data') return send(res, 200, loadData());
          const m = url.pathname.match(/^\/pitches\/([^/]+)$/);
          if (req.method === 'GET' && m) {
            if (!ID.test(m[1])) return send(res, 400, { error: 'invalid game id' });
            return send(res, 200, readCsv(join(RAW, 'pitches', `${m[1]}.csv`)));
          }
          if (req.method === 'POST' && url.pathname === '/save') return send(res, 200, save(JSON.parse(await readBody(req))));
          send(res, 404, { error: 'not found' });
        } catch (e) {
          send(res, 500, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}
