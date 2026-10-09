// Data helpers for the player-page charts (spray chart, zone grid, velocity, percentiles).
// Charts use pitch rows from detailed games only (games charted in the charting tool).

import { fromBasePaths, PLATE, wall } from './field';

export interface PitchRec {
  game_id: string;
  pitch_id: number;
  inning: number;
  balls: number;
  strikes: number;
  velo: number | null;
  pitch_type: string | null;
  zone: number | null;
  result: string;
  bb_type: string | null;
  fielder_pos: number | null;
  field_x: number | null;
  field_y: number | null;
  contact_quality: string | null;
  pa_result: string | null;
  p_hand: 'L' | 'R' | null;
  b_side: 'L' | 'R' | null;
  pitcher_id?: string;
  batter_id?: string;
}

export const SWINGS = new Set(['swinging_strike', 'foul', 'foul_tip', 'in_play']);
const HITS = new Set(['1B', '2B', '3B', 'HR']);
const NOT_AB = new Set(['BB', 'HBP', 'SF', 'SH']);

export type ResultClass = 'hit' | 'out' | 'other';
export function resultClass(paResult: string | null): ResultClass {
  if (paResult && HITS.has(paResult)) return 'hit';
  if (paResult === 'E' || paResult === null) return 'other';
  return 'out';
}

// Filters (one row above the charts).
export interface ChartFilter {
  hand: '' | 'L' | 'R';
  count: '' | 'ahead' | 'even' | 'behind' | 'two';
  velo: '' | 'lt100' | '100' | '110' | '120';
}
export const NO_FILTER: ChartFilter = { hand: '', count: '', velo: '' };

export function applyFilter(rows: PitchRec[], f: ChartFilter, role: 'batting' | 'pitching'): PitchRec[] {
  return rows.filter((r) => {
    if (f.hand && (role === 'batting' ? r.p_hand : r.b_side) !== f.hand) return false;
    if (f.count === 'ahead' && !(r.balls > r.strikes)) return false;
    if (f.count === 'even' && r.balls !== r.strikes) return false;
    if (f.count === 'behind' && !(r.strikes > r.balls)) return false;
    if (f.count === 'two' && r.strikes !== 2) return false;
    if (f.velo) {
      if (r.velo === null) return false;
      const band = r.velo < 100 ? 'lt100' : r.velo < 110 ? '100' : r.velo < 120 ? '110' : '120';
      if (band !== f.velo) return false;
    }
    return true;
  });
}

// ---- Velocity distribution (KDE per pitch type) ------------------------------------------------

export const FASTBALLS = new Set(['FF', 'SI', 'FC', 'RF']);
/** Fewer pitches than this: show each pitch as a dot instead of a curve. */
export const KDE_MIN_N = 5;
/** Colored series per chart; four hues are all that stay distinct pairwise in both themes. */
export const VELO_COLORS = 4;
/** Smallest bandwidth (km/h): the stream shows whole numbers, so narrower curves only draw noise. */
const MIN_BW = 2;

export type VeloMode = 'type' | 'group';
/** Series key: a pitch type code, 'fastball' / 'offspeed' (group mode), 'etc' (folded types) or '' (unknown type). */
export interface VeloSeries {
  key: string;
  codes: string[];
  velos: number[];
  /** Color slot 0-3, or null for the gray etc/unknown series. */
  color: number | null;
  /** Points [km/h, height 0-1] normalized to the curve's own peak; null below KDE_MIN_N pitches. */
  curve: [number, number][] | null;
}

/** Silverman's rule of thumb with the robust spread (min of SD and IQR/1.34), floored at MIN_BW. */
export function bandwidth(values: number[]): number {
  const n = values.length;
  if (n < 2) return MIN_BW;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    const i = Math.floor(p * (n - 1));
    return s[i] + (s[Math.min(i + 1, n - 1)] - s[i]) * (p * (n - 1) - i);
  };
  const spread = Math.min(sd, (q(0.75) - q(0.25)) / 1.34) || sd;
  return Math.max(MIN_BW, 0.9 * spread * n ** -0.2);
}

/** Gaussian kernel density at each x, scaled so the highest point is 1. */
export function kde(values: number[], xs: number[]): number[] {
  const h = bandwidth(values);
  const d = xs.map((x) => values.reduce((a, v) => a + Math.exp(-0.5 * ((x - v) / h) ** 2), 0));
  const peak = Math.max(...d);
  return d.map((v) => (peak > 0 ? v / peak : 0));
}

/** Axis range in km/h: the data plus some room, on 5 km/h marks. */
export function veloDomain(values: number[]): [number, number] {
  return [Math.floor((Math.min(...values) - 4) / 5) * 5, Math.ceil((Math.max(...values) + 4) / 5) * 5];
}

const groupOf = (type: string | null, mode: VeloMode) => (!type ? '' : mode === 'type' ? type : FASTBALLS.has(type) ? 'fastball' : 'offspeed');

/**
 * Series for the velocity chart. `rows` are the filtered pitches shown; `all` are the player's pitches
 * before filters, which fix the colors so a filter never repaints a curve. The most-thrown keys get the
 * colors; any beyond VELO_COLORS fold into one gray 'etc' series.
 */
export function veloSeries(rows: PitchRec[], all: PitchRec[], mode: VeloMode): VeloSeries[] {
  const usage = new Map<string, number>();
  for (const r of all) {
    const k = groupOf(r.pitch_type, mode);
    if (k && r.velo !== null) usage.set(k, (usage.get(k) ?? 0) + 1);
  }
  const ranked = [...usage.keys()].sort((a, b) => usage.get(b)! - usage.get(a)! || a.localeCompare(b));
  const slot = new Map(ranked.slice(0, VELO_COLORS).map((k, i) => [k, i]));

  const groups = new Map<string, { codes: Set<string>; velos: number[] }>();
  for (const r of rows) {
    if (r.velo === null) continue;
    const g = groupOf(r.pitch_type, mode);
    const key = g && !slot.has(g) ? 'etc' : g;
    if (!groups.has(key)) groups.set(key, { codes: new Set(), velos: [] });
    groups.get(key)!.velos.push(r.velo);
    if (r.pitch_type) groups.get(key)!.codes.add(r.pitch_type);
  }
  const timed = rows.filter((r) => r.velo !== null).map((r) => r.velo!);
  const [lo, hi] = timed.length ? veloDomain(timed) : [0, 0];
  const xs = Array.from({ length: (hi - lo) * 2 + 1 }, (_, i) => lo + i / 2);
  const order = (k: string) => (slot.has(k) ? slot.get(k)! : k === 'etc' ? VELO_COLORS : VELO_COLORS + 1);
  return [...groups.entries()]
    .sort(([a], [b]) => order(a) - order(b))
    .map(([key, g]) => {
      const curve = g.velos.length >= KDE_MIN_N ? kde(g.velos, xs) : null;
      return {
        key,
        codes: [...g.codes].sort(),
        velos: g.velos,
        color: slot.get(key) ?? null,
        curve: curve && xs.map((x, i) => [x, curve[i]] as [number, number]),
      };
    });
}

// ---- Zone grid (catcher's view) --------------------------------------------------------------

/** Cell geometry on a 5x5 grid: zones 1-9 are the inner 3x3, 11-14 the L-shaped outer quadrants. */
export function zoneShapes(): { zone: number; points: [number, number][]; label: [number, number] }[] {
  const shapes: { zone: number; points: [number, number][]; label: [number, number] }[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      shapes.push({
        zone: r * 3 + c + 1,
        points: [[c + 1, r + 1], [c + 2, r + 1], [c + 2, r + 2], [c + 1, r + 2]],
        label: [c + 1.5, r + 1.5],
      });
  // Outer quadrants: L-shapes around the inner square, split at the middle.
  shapes.push({ zone: 11, points: [[0, 0], [2.5, 0], [2.5, 1], [1, 1], [1, 2.5], [0, 2.5]], label: [0.5, 0.5] });
  shapes.push({ zone: 12, points: [[2.5, 0], [5, 0], [5, 2.5], [4, 2.5], [4, 1], [2.5, 1]], label: [4.5, 0.5] });
  shapes.push({ zone: 13, points: [[0, 2.5], [1, 2.5], [1, 4], [2.5, 4], [2.5, 5], [0, 5]], label: [0.5, 4.5] });
  shapes.push({ zone: 14, points: [[4, 2.5], [5, 2.5], [5, 5], [2.5, 5], [2.5, 4], [4, 4]], label: [4.5, 4.5] });
  return shapes;
}

export type ZoneMetric = 'share' | 'swing' | 'whiff' | 'avg';

/** Value and sample size of a metric for the pitches in one zone. */
export function zoneValue(rows: PitchRec[], all: number, metric: ZoneMetric): { value: number | null; n: number } {
  switch (metric) {
    case 'share':
      return { value: all ? rows.length / all : null, n: rows.length };
    case 'swing': {
      const swings = rows.filter((r) => SWINGS.has(r.result)).length;
      return { value: rows.length ? swings / rows.length : null, n: rows.length };
    }
    case 'whiff': {
      const swings = rows.filter((r) => SWINGS.has(r.result));
      const whiffs = swings.filter((r) => r.result === 'swinging_strike').length;
      return { value: swings.length ? whiffs / swings.length : null, n: swings.length };
    }
    case 'avg': {
      const ab = rows.filter((r) => r.pa_result && !NOT_AB.has(r.pa_result));
      const hits = ab.filter((r) => HITS.has(r.pa_result!)).length;
      return { value: ab.length ? hits / ab.length : null, n: ab.length };
    }
  }
}

// ---- Spray chart areas -----------------------------------------------------------------------

const polar = (r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return fromBasePaths(r * Math.sin(rad), r * Math.cos(rad)); // deg 0 = third-base line, 90 = first-base line
};

function wedge(r0: number, r1: number, d0: number, d1: number): { x: number; y: number }[] {
  const pts = [];
  for (let d = d0; d <= d1 + 1e-9; d += (d1 - d0) / 12) pts.push(polar(r1, d));
  for (let d = d1; d >= d0 - 1e-9; d -= (d1 - d0) / 12) pts.push(polar(r0, d));
  return pts;
}

/** Area each fielder covers (approximate wedges, clipped to fair territory when drawn). */
export const FIELDER_AREAS: { pos: number; points: { x: number; y: number }[] }[] = [
  { pos: 2, points: wedge(0, 0.5, 0, 90) },
  { pos: 5, points: wedge(0.5, 1.65, 0, 22.5) },
  { pos: 6, points: wedge(0.5, 1.65, 22.5, 45) },
  { pos: 4, points: wedge(0.5, 1.65, 45, 67.5) },
  { pos: 3, points: wedge(0.5, 1.65, 67.5, 90) },
  { pos: 7, points: wedge(1.65, 5, 0, 30) },
  { pos: 8, points: wedge(1.65, 5, 30, 60) },
  { pos: 9, points: wedge(1.65, 5, 60, 90) },
];
export const PITCHER_AREA = { center: fromBasePaths(0.5, 0.5), radius: 0.3 * 0.16 };
export const FAIR = [PLATE, ...wall];

// ---- Color scales ------------------------------------------------------------------------------
// Sequential: the reference blue ramp (light -> dark). Diverging: blue (poor) <-> gray <-> red (good),
// as on Baseball Savant's percentile bars.

const BLUE_RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/** Sequential blue for t in 0..1. In dark mode the lightest steps are skipped so cells stay visible. */
export function seqColor(t: number, dark: boolean): string {
  const ramp = dark ? BLUE_RAMP.slice(4) : BLUE_RAMP;
  const i = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const lo = Math.floor(i);
  return mix(ramp[lo], ramp[Math.min(ramp.length - 1, lo + 1)], i - lo);
}

/** Text ink that stays readable on a fill. */
export function inkOn(fill: string): string {
  const [r, g, b] = hexToRgb(fill);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? '#0b0b0b' : '#ffffff';
}

/** Percentile 0-100 -> blue (poor) .. gray (50) .. red (good). */
export function divColor(pct: number, dark: boolean): string {
  const mid = dark ? '#5a5a57' : '#b9b8b2';
  const t = Math.abs(pct - 50) / 50;
  return pct >= 50 ? mix(mid, dark ? '#e66767' : '#e34948', t) : mix(mid, dark ? '#3987e5' : '#256abf', t);
}
