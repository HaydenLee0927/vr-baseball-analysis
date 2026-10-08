import { describe, expect, it } from 'vitest';
import { handsLabel, seasonOrder } from '../lib/display';
import { formatDate, formatStat } from '../lib/format';
import { searchPlayers } from '../lib/search';
import type { GameSummary, Person } from '../lib/types';

describe('formatStat', () => {
  it('formats like Korean baseball media', () => {
    expect(formatStat(0.3125, 'avg')).toBe('.313');
    expect(formatStat(1, 'avg')).toBe('1.000');
    expect(formatStat(0.312, 'pct')).toBe('31.2%');
    expect(formatStat(2.1176, 'dec2')).toBe('2.12');
    expect(formatStat(113.52, 'dec1')).toBe('113.5');
    expect(formatStat(1234, 'int')).toBe('1,234');
    expect(formatStat('5.2', 'ip')).toBe('5.2');
    expect(formatStat(null, 'avg')).toBe('–');
  });

  it('formats dates with dots', () => {
    expect(formatDate('2026-10-07')).toBe('2026.10.07');
    expect(formatDate(null)).toBe('');
  });
});

describe('searchPlayers', () => {
  const p = (id: string, name: string, vrchat_name = name, romanized = name): Person => ({
    id, slug: id, name, vrchat_name, romanized, bats: null, throws: null,
  });
  const rows = [p('daki', '__Daki__', '__Daki__', '__Daki__'), p('dambi', '담비는흥흥', '담비는흥흥', 'dambineunheungheung'), p('dambi', '담비는흥흥')];

  it('matches partial Hangul, ignores case and underscores, one row per player', () => {
    expect(searchPlayers(rows, '담비').map((r) => r.id)).toEqual(['dambi']);
    expect(searchPlayers(rows, 'daki').map((r) => r.id)).toEqual(['daki']);
    expect(searchPlayers(rows, 'dambin').map((r) => r.id)).toEqual(['dambi']); // romanized
    expect(searchPlayers(rows, '  ')).toEqual([]);
  });
});

describe('display helpers', () => {
  it('handedness label', () => {
    expect(handsLabel('R', 'L', true, true)).toBe('우투좌타');
    expect(handsLabel('S', 'R', true, true)).toBe('양투우타');
    expect(handsLabel('R', 'L', false, true)).toBe('좌타');
    expect(handsLabel(null, null, true, true)).toBe('');
  });

  it('orders seasons by their latest game, undated last', () => {
    const g = (season: string, date: string | null) => ({ season, date }) as GameSummary;
    expect(seasonOrder(['wbd-legacy', 'a-2024', 'b-2025'], [g('a-2024', '2024-05-01'), g('b-2025', '2025-03-14'), g('wbd-legacy', null)])).toEqual([
      'b-2025',
      'a-2024',
      'wbd-legacy',
    ]);
  });
});
