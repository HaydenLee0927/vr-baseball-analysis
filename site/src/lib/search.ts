import type { Person } from './types';

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-.]+/g, '');

/**
 * Players matching a search: partial match on the display name, VRChat name or romanized name,
 * ignoring case, spaces and underscores (so "daki" finds "__Daki__"). One result per player.
 */
export function searchPlayers<T extends Person>(rows: T[], query: string): T[] {
  const q = norm(query);
  if (!q) return [];
  const seen = new Set<string>();
  const hits: { row: T; rank: number }[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    const fields = [row.name, row.vrchat_name, row.romanized].map(norm);
    const rank = fields.some((f) => f === q) ? 0 : fields.some((f) => f.startsWith(q)) ? 1 : fields.some((f) => f.includes(q)) ? 2 : -1;
    if (rank < 0) continue;
    seen.add(row.id);
    hits.push({ row, rank });
  }
  return hits.sort((a, b) => a.rank - b.rank || a.row.name.localeCompare(b.row.name, 'ko')).map((h) => h.row);
}
