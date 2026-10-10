// @vitest-environment jsdom
// Locked site: only the example players' pages are open; 풀버전 asks for the password and opens everything.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixture.json';
import { ko } from '../i18n/ko';
import { App } from '../main';

const SAMPLE: Record<string, unknown> = {
  'sample.json': { players: [{ slug: 'v-a', name: 'VR_v-a' }, { slug: 'h-p', name: 'VR_h-p' }] },
  'player/v-a.json': fixture['player/v-a.json'],
  'player/h-p.json': fixture['player/h-p.json'],
  'games.json': fixture['games.json'],
  'league.json': fixture['league.json'],
  'teams.json': fixture['teams.json'],
};

const access = vi.hoisted(() => ({ unlocked: false }));
vi.mock('../lib/loadData', () => ({
  isPublicMode: false,
  lock: () => {},
  tryStoredKey: async () => false,
  unlock: async (password: string) => (access.unlocked = password === 'right'),
  loadData: (path: string) => {
    const data = access.unlocked ? (fixture as Record<string, unknown>)[path] : SAMPLE[path];
    return data === undefined ? Promise.reject(new Error(`not available: ${path}`)) : Promise.resolve(data);
  },
}));

afterEach(() => {
  cleanup();
  access.unlocked = false;
});

const at = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <App />
    </MemoryRouter>,
  );

describe('example page without the password', () => {
  it('home opens the example player, with the banner and no search or leaderboard', async () => {
    at('/');
    expect(await screen.findByRole('heading', { name: 'VR_v-a' })).toBeTruthy();
    expect(screen.getByText(ko.gate.sampleBanner, { exact: false })).toBeTruthy();
    expect(screen.queryByRole('link', { name: ko.nav.leaderboard })).toBeNull();
    expect(screen.queryByPlaceholderText(ko.search.placeholder)).toBeNull();
  });

  it('the banner links to every example player', async () => {
    at('/');
    await screen.findByRole('heading', { name: 'VR_v-a' });
    fireEvent.click(screen.getByRole('link', { name: 'VR_h-p' }));
    expect(await screen.findByRole('heading', { name: 'VR_h-p' })).toBeTruthy();
  });

  it('other players and the leaderboard ask for the full version', async () => {
    at('/player/h-a');
    expect(await screen.findByText(ko.gate.fullOnly)).toBeTruthy();
    cleanup();
    at('/leaderboard');
    expect(await screen.findByText(ko.gate.fullOnly)).toBeTruthy();
  });

  it('풀버전 with the right password opens the full site', async () => {
    at('/player/h-a');
    fireEvent.click((await screen.findAllByRole('button', { name: ko.gate.fullVersion }))[0]);
    fireEvent.change(screen.getByLabelText(ko.gate.passwordLabel), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: ko.gate.submit }));
    expect(await screen.findByText(ko.gate.wrongPassword)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(ko.gate.passwordLabel), { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: ko.gate.submit }));
    expect(await screen.findByRole('heading', { name: 'VR_h-a' })).toBeTruthy();
    expect(screen.getByRole('link', { name: ko.nav.leaderboard })).toBeTruthy();
    expect(screen.queryByText(ko.gate.sampleBanner, { exact: false })).toBeNull();
  });
});
