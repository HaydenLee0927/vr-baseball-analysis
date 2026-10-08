import { useEffect, useState } from 'react';
import { Chart } from './Chart';
import {
  deleteDraft,
  draftFromSaved,
  fetchData,
  fetchPitches,
  gameFromRecord,
  handDefaults,
  listDrafts,
  loadDraft,
  storeDraft,
  typedRow,
  type Draft,
  type ServerData,
} from './data';
import { initialState } from './engine';
import { Setup, type SetupResult } from './Setup';

type Screen = 'home' | 'new' | 'chart' | 'setup';

export function App() {
  const [data, setData] = useState<ServerData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [, refresh] = useState(0);

  const reload = () => fetchData().then(setData, (e: Error) => setLoadError(e.message));
  useEffect(() => {
    void reload();
  }, []);

  function change(d: Draft) {
    setDraft(d);
    storeDraft(d); // autosave on every change
  }

  async function openSaved(gameId: string) {
    if (!data) return;
    if (loadDraft(gameId) && !confirm(`There is an unsaved local draft of ${gameId}.\n\nOpen the saved file instead and discard the draft?`)) return;
    const rec = data.games.find((g) => g.game_id === gameId);
    if (!rec) return alert(`${gameId} is not in games.csv`);
    const rows = (await fetchPitches(gameId)).map((r) => typedRow(r, data.pitchSchema));
    change(draftFromSaved(gameFromRecord(rec), rows, handDefaults(data.players)));
    setScreen('chart');
  }

  function finishSetup(r: SetupResult) {
    if (!data) return;
    if (screen === 'new') {
      change({
        version: 1,
        ...r,
        rows: [],
        before: [],
        state: initialState(r.lineups, {}, handDefaults(data.players)),
        memory: {},
        updatedAt: new Date().toISOString(),
        savedAt: null,
      });
    } else if (draft) {
      change({ ...draft, ...r, updatedAt: new Date().toISOString() });
    }
    setScreen('chart');
  }

  if (loadError) return <main className="setup"><h1>Cannot load data</h1><p className="error">{loadError}</p></main>;
  if (!data) return <main className="setup"><p>Loading…</p></main>;

  if ((screen === 'new' || screen === 'setup') && (screen === 'new' || draft)) {
    const taken = new Set([...data.games.map((g) => g.game_id), ...listDrafts().map((d) => d.game.game_id)]);
    return <Setup data={data} draft={screen === 'setup' ? draft : null} takenIds={taken} onDone={finishSetup} onCancel={() => setScreen(draft && screen === 'setup' ? 'chart' : 'home')} />;
  }
  if (screen === 'chart' && draft) {
    return (
      <Chart
        data={data}
        draft={draft}
        onChange={change}
        onSetup={() => setScreen('setup')}
        onClose={() => {
          setDraft(null);
          setScreen('home');
          void reload();
        }}
      />
    );
  }

  const drafts = listDrafts();
  return (
    <main className="setup">
      <h1>VR Savant charting</h1>
      <p className="muted">Local only. Saves go to data/raw; commit and push the data repo to publish.</p>
      <button type="button" onClick={() => setScreen('new')}>
        New game
      </button>

      <h2>Drafts on this computer</h2>
      {drafts.length === 0 && <p className="muted">None.</p>}
      <ul className="list">
        {drafts.map((d) => (
          <li key={d.game.game_id}>
            <button type="button" className="link" onClick={() => { setDraft(d); setScreen('chart'); }}>
              {d.game.label || d.game.game_id}
            </button>
            <span className="muted small">
              {d.game.game_id} · {d.rows.length} rows · edited {new Date(d.updatedAt).toLocaleString()}
              {d.savedAt && d.savedAt >= d.updatedAt ? ' · saved' : ' · not saved to data/raw'}
            </span>
            <button
              type="button"
              className="mini"
              onClick={() => {
                if (confirm(`Delete the local draft of ${d.game.game_id}? Anything not saved to data/raw is lost.`)) {
                  deleteDraft(d.game.game_id);
                  refresh((n) => n + 1);
                }
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      <h2>Games in data/raw</h2>
      <ul className="list">
        {data.games.map((g) => (
          <li key={g.game_id}>
            {data.pitchFiles.includes(g.game_id) ? (
              <button type="button" className="link" onClick={() => void openSaved(g.game_id)}>
                {g.label || g.game_id}
              </button>
            ) : (
              <span>{g.label || g.game_id}</span>
            )}
            <span className="muted small">
              {g.game_id} · {g.away_team_id} @ {g.home_team_id} · {g.chart_status}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
