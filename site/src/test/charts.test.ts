import { describe, expect, it } from 'vitest';
import { applyFilter, bandwidth, divColor, kde, NO_FILTER, resultClass, veloSeries, zoneShapes, zoneValue, type PitchRec } from '../lib/charts';

const p = (over: Partial<PitchRec>): PitchRec => ({
  game_id: 'g', pitch_id: 1, inning: 1, balls: 0, strikes: 0, velo: 110, pitch_type: null, zone: 5, result: 'ball',
  bb_type: null, fielder_pos: null, field_x: null, field_y: null, contact_quality: null, pa_result: null, p_hand: 'R', b_side: 'L',
  ...over,
});

describe('chart helpers', () => {
  it('velocity curves: peak at 1 near the data, bandwidth never below 2 km/h', () => {
    expect(bandwidth([110, 110, 110])).toBe(2);
    expect(bandwidth([90, 100, 110, 120, 130])).toBeGreaterThan(2);
    const d = kde([100, 100, 101, 99, 100], [90, 100, 110]);
    expect(d[1]).toBe(1);
    expect(d[0]).toBeLessThan(0.01);
  });

  it('velocity series: curves from 5 pitches, dots below, colors fixed by unfiltered usage', () => {
    const all = [
      ...Array.from({ length: 6 }, (_, i) => p({ pitch_type: 'FF', velo: 110 + i })),
      ...Array.from({ length: 5 }, (_, i) => p({ pitch_type: 'SL', velo: 95 + i })),
      p({ pitch_type: 'SI', velo: 100 }), p({ pitch_type: 'SP', velo: 92 }), p({ pitch_type: 'CU', velo: 85 }),
      p({ pitch_type: 'RF', velo: 105 }), p({ pitch_type: null, velo: 101 }), p({ pitch_type: 'FF', velo: null }),
    ];
    const s = veloSeries(all, all, 'type');
    expect(s.map((x) => [x.key, x.velos.length, x.color, x.curve !== null])).toEqual([
      ['FF', 6, 0, true], ['SL', 5, 1, true], ['CU', 1, 2, false], ['RF', 1, 3, false], ['etc', 2, null, false], ['', 1, null, false],
    ]);
    expect(s.find((x) => x.key === 'etc')!.codes).toEqual(['SI', 'SP']);
    // Filtering out the fastballs keeps the slider's color.
    expect(veloSeries(all.filter((r) => r.pitch_type !== 'FF'), all, 'type')[0]).toMatchObject({ key: 'SL', color: 1 });
    const g = veloSeries(all, all, 'group');
    expect(g.map((x) => [x.key, x.velos.length, x.color])).toEqual([['fastball', 8, 0], ['offspeed', 7, 1], ['', 1, null]]);
  });

  it('classes balls in play', () => {
    expect([resultClass('HR'), resultClass('DP'), resultClass('E'), resultClass(null)]).toEqual(['hit', 'out', 'other', 'other']);
  });

  it('filters by hand, count and velocity band', () => {
    const rows = [p({ p_hand: 'L', balls: 2, strikes: 0, velo: 95 }), p({ p_hand: 'R', balls: 0, strikes: 2, velo: 121 }), p({ velo: null })];
    expect(applyFilter(rows, { ...NO_FILTER, hand: 'L' }, 'batting')).toHaveLength(1);
    expect(applyFilter(rows, { ...NO_FILTER, hand: 'L' }, 'pitching')).toHaveLength(3); // pitchers filter on the batter's side (all L here)
    expect(applyFilter(rows, { ...NO_FILTER, count: 'ahead' }, 'batting')).toHaveLength(1);
    expect(applyFilter(rows, { ...NO_FILTER, count: 'two' }, 'batting')).toHaveLength(1);
    expect(applyFilter(rows, { ...NO_FILTER, velo: '120' }, 'batting')).toHaveLength(1);
    expect(applyFilter(rows, { ...NO_FILTER, velo: 'lt100' }, 'batting')).toHaveLength(1); // unknown velocity drops out
  });

  it('computes zone metrics with their sample size', () => {
    const rows = [p({ result: 'swinging_strike' }), p({ result: 'foul' }), p({ result: 'ball' }), p({ result: 'in_play', pa_result: '1B' })];
    expect(zoneValue(rows, 8, 'share')).toEqual({ value: 0.5, n: 4 });
    expect(zoneValue(rows, 8, 'swing')).toEqual({ value: 0.75, n: 4 });
    expect(zoneValue(rows, 8, 'whiff').value).toBeCloseTo(1 / 3);
    expect(zoneValue(rows, 8, 'avg')).toEqual({ value: 1, n: 1 });
  });

  it('has 13 zone cells and a diverging scale with a gray middle', () => {
    expect(zoneShapes().map((s) => s.zone).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14]);
    expect(divColor(50, false)).toBe('#b9b8b2');
    expect(divColor(100, false)).toBe('#e34948');
    expect(divColor(0, false)).toBe('#256abf');
  });
});
