import { describe, expect, it } from 'vitest';
import { applyFilter, divColor, NO_FILTER, resultClass, zoneShapes, zoneValue, type PitchRec } from '../lib/charts';

const p = (over: Partial<PitchRec>): PitchRec => ({
  game_id: 'g', pitch_id: 1, inning: 1, balls: 0, strikes: 0, velo: 110, pitch_type: null, zone: 5, result: 'ball',
  bb_type: null, fielder_pos: null, field_x: null, field_y: null, contact_quality: null, pa_result: null, p_hand: 'R', b_side: 'L',
  ...over,
});

describe('chart helpers', () => {
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
