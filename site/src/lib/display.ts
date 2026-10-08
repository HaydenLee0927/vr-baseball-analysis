import { ko } from '../i18n/ko';
import type { GameSummary, Hand, Team } from './types';

export function teamName(teams: Team[] | null, id: string): string {
  return teams?.find((t) => t.team_id === id)?.name ?? id;
}

/** "우투좌타", "좌투", "양타"… from the hands seen in the charted games. */
export function handsLabel(throws: Hand, bats: Hand, pitches: boolean, bats_: boolean): string {
  const t = throws && pitches ? ko.hands[throws] : null;
  const b = bats && bats_ ? ko.hands[bats] : null;
  if (t && b) return ko.hands.throwsBats(t, b);
  if (t) return ko.hands.throwsOnly(t);
  if (b) return ko.hands.batsOnly(b);
  return '';
}

/** Seasons, most recent first: by their latest game date; seasons without dates go last. */
export function seasonOrder(seasons: string[], games: GameSummary[] | null): string[] {
  const latest = (s: string) =>
    (games ?? [])
      .filter((g) => g.season === s && g.date)
      .map((g) => g.date!)
      .sort()
      .at(-1) ?? '';
  return [...seasons].sort((a, b) => latest(b).localeCompare(latest(a)) || a.localeCompare(b));
}
