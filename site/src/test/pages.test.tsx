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

  it('hitter leaderboard hides small samples until "전체 보기"', async () => {
    at('/leaderboard');
    expect(await screen.findByText('기록이 없습니다.')).toBeTruthy(); // nobody has 5 PA in one inning
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
    at('/player/h-p');
    expect(await screen.findByRole('heading', { name: 'VR_h-p' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '투구 기록' })).toBeTruthy();
    expect(screen.getByText('상대 타자 4명')).toBeTruthy();
    expect(screen.getAllByText('타자 유리 카운트').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /경기별 기록/ })).toBeTruthy();
  });

  it('unknown player shows not found', async () => {
    at('/player/nobody');
    expect(await screen.findByText('찾을 수 없습니다.')).toBeTruthy();
  });

  it('stat help opens on tap with the league average and closes on Escape', async () => {
    at('/player/v-a');
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
