// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ZoneChart } from '../components/charts/ZoneChart';
import type { PitchRec } from '../lib/charts';

afterEach(cleanup);

const p = (zone: number): PitchRec => ({
  game_id: 'g', pitch_id: 1, inning: 1, balls: 0, strikes: 0, velo: 110, pitch_type: null, zone, result: 'ball',
  bb_type: null, fielder_pos: null, field_x: null, field_y: null, contact_quality: null, pa_result: null, p_hand: 'R', b_side: 'L',
});

describe('ZoneChart', () => {
  it('shows pitch share for cells with only one or two pitches; rates still need 3', () => {
    const { container } = render(<ZoneChart rows={[p(5), p(5), p(11), p(14)]} />);
    const labels = () => [...container.querySelectorAll('svg .viz-label')].map((t) => t.textContent).filter((t) => t !== '–');
    expect(labels().sort()).toEqual(['25%', '25%', '50%']);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'swing' } });
    expect(labels()).toEqual([]);
    expect(screen.getByText(/표본 3개 미만인 칸은/)).toBeTruthy();
  });
});
