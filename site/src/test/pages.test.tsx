// @vitest-environment jsdom
// Smoke tests: each page renders from fixture JSON (src/test/fixture.json, the synthetic game
// from pipeline/tests/fixture.py; regenerate with `python pipeline/tests/fixture.py`).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixture.json';
import { SearchBox } from '../components/SearchBox';
import { Glossary } from '../pages/Glossary';
import { Home } from '../pages/Home';
import { Leaderboard } from '../pages/Leaderboard';
import { Player } from '../pages/Player';

vi.mock('../lib/loadData', () => ({
  isPublicMode: true,
  lock: () => {},
  loadData: (path: string) => {
    const data = (fixture as Record<string, unknown>)[path];
    return data === undefined ? Promise.reject(new Error(`no fixture for ${path}`)) : Promise.resolve(data);
  },
}));

afterEach(cleanup);

function at(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/player/:slug" element={<Player />} />
        <Route path="/glossary" element={<Glossary />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('pages', () => {
  it('home lists the charted game and coverage', async () => {
    at('/');
    expect(await screen.findByText(/기록된 경기 1개/)).toBeTruthy();
    expect(await screen.findByText(/away 1 : 2 home/)).toBeTruthy();
  });

  it('hitter leaderboard shows everyone, with a note, when nobody reaches the minimum', async () => {
    at('/leaderboard');
    expect(await screen.findByText(/아직 기준\(5\) 이상인 선수가 없어/)).toBeTruthy(); // nobody has 5 PA in one inning
    expect(within(screen.getByRole('table')).getByText('VR_v-a')).toBeTruthy();
    cleanup();
    at('/leaderboard?min=1');
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(screen.queryByText(/아직 기준/)).toBeNull(); // everyone has 1 PA: the minimum applies normally
    cleanup();
    at('/leaderboard?all=1');
    const table = await screen.findByRole('table');
    expect(within(table).getByText('VR_v-a')).toBeTruthy();
    expect(within(table).getByText('4.000')).toBeTruthy(); // v-a's SLG: a home run in one at-bat
  });

  it('pitcher leaderboard shows rates with their sample size', async () => {
    at('/leaderboard?role=pitching&all=1');
    const table = await screen.findByRole('table');
    const row = within(table).getByText('VR_h-p').closest('tr')!;
    expect(within(row).getByText('9.00')).toBeTruthy(); // RA9
    expect(within(row).getByText('40.0%')).toBeTruthy(); // whiff% 2 of 5 swings
    expect(within(row).getByTitle('표본: 스윙 5')).toBeTruthy();
  });

  it('player page shows season lines, splits and game log', async () => {
    at('/player/h-p?view=detailed');
    expect(await screen.findByRole('heading', { name: 'VR_h-p' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '투구 기록' })).toBeTruthy();
    expect(screen.getByText('상대 타자 4명')).toBeTruthy();
    expect(screen.getAllByText('타자 유리 카운트').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /경기별 기록/ })).toBeTruthy();
  });

  it('player page opens on the simple view with charts; detailed adds the zone chart and tables', async () => {
    at('/player/h-p');
    await screen.findByRole('heading', { name: 'VR_h-p' });
    expect(screen.getByRole('heading', { name: '백분위' })).toBeTruthy();
    expect(screen.getByText(/비교할 선수가 아직 부족합니다/)).toBeTruthy(); // one inning: no percentile pool
    expect(screen.getByRole('heading', { name: '타구 방향' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '존 차트' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: '투구 기록' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '자세히' }));
    expect(await screen.findByRole('heading', { name: '존 차트' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '구속' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '투구 기록' })).toBeTruthy();
  });

  it('chart filters narrow the pitches', async () => {
    at('/player/h-p');
    await screen.findByText('투구 11개');
    fireEvent.change(screen.getByLabelText('볼카운트'), { target: { value: 'behind' } });
    expect(screen.getByText('투구 2개')).toBeTruthy(); // the 0-1 foul and the 0-2 strikeout pitch
  });

  it('spray chart uses fielder areas when no landing spots were charted', async () => {
    at('/player/v-a');
    await screen.findByRole('heading', { name: 'VR_v-a' });
    expect(screen.getByText(/착지 위치가 기록된 타구가 없어/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '점' }).hasAttribute('disabled')).toBe(true);
  });

  it('a player without detailed games opens on the tables', async () => {
    const file = (fixture as unknown as Record<string, { pitches: { as_batter: unknown[]; as_pitcher: unknown[] } }>)['player/h-b.json'];
    const saved = file.pitches;
    file.pitches = { as_batter: [], as_pitcher: [] };
    at('/player/h-b');
    expect(await screen.findByText(/그래프에 쓸 상세 기록/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '타격 기록' })).toBeTruthy();
    file.pitches = saved;
  });

  it('unknown player shows not found', async () => {
    at('/player/nobody');
    expect(await screen.findByText('찾을 수 없습니다.')).toBeTruthy();
  });

  it('stat help opens on tap with the league average and closes on Escape', async () => {
    at('/player/v-a?view=detailed');
    await screen.findByRole('heading', { name: 'VR_v-a' });
    fireEvent.click(screen.getAllByRole('button', { name: '타율 (AVG) 설명' })[0]);
    const pop = await screen.findByRole('dialog', { name: '타율 (AVG)' });
    expect(within(pop).getByText(/안타를 타수로 나눈 값/)).toBeTruthy();
    expect(await within(pop).findByText(/리그 평균 \.600/)).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('glossary lists hitter and pitcher stats', () => {
    at('/glossary');
    expect(screen.getByText('헛스윙률 (Whiff%)', { selector: '#stat-batting-whiff_pct dt' })).toBeTruthy();
    expect(screen.getByText('9이닝당 실점 (RA9)')).toBeTruthy();
  });

  it('search finds players by partial name', async () => {
    render(
      <MemoryRouter>
        <SearchBox />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'h-p' } });
    expect(await screen.findByRole('link', { name: 'VR_h-p' })).toBeTruthy();
  });
});
