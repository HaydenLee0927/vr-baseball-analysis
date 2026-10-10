import { createContext, Fragment, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ko } from '../i18n/ko';
import { isPublicMode, loadData, tryStoredKey, unlock } from '../lib/loadData';
import { clearDataCache } from '../lib/useData';

type Status = 'checking' | 'locked' | 'unlocked';

export interface SamplePlayer {
  slug: string;
  name: string;
}

/** Locked visitors see only the example players' pages; `full` is true once the password is in. */
export interface Access {
  full: boolean;
  samplePlayers: SamplePlayer[];
  openGate: () => void;
}

const AccessContext = createContext<Access>({ full: true, samplePlayers: [], openGate: () => {} });
export const useAccess = () => useContext(AccessContext);

export function PasswordGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(isPublicMode ? 'unlocked' : 'checking');
  // undefined while loading; null when there are no example pages, so the form is all there is.
  const [samplePlayers, setSamplePlayers] = useState<SamplePlayer[] | null | undefined>(undefined);
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    if (isPublicMode) return;
    tryStoredKey()
      .then((ok) => setStatus(ok ? 'unlocked' : 'locked'))
      .catch(() => setStatus('locked'));
  }, []);

  useEffect(() => {
    if (status !== 'locked') return;
    loadData<{ players: SamplePlayer[] }>('sample.json')
      .then((s) => setSamplePlayers(s.players.length ? s.players : null))
      .catch(() => setSamplePlayers(null));
  }, [status]);

  const onUnlocked = () => {
    clearDataCache(); // the example files give way to the full data
    setGateOpen(false);
    setStatus('unlocked');
  };

  if (status === 'checking' || (status === 'locked' && samplePlayers === undefined)) return <p className="center muted">{ko.common.loading}</p>;
  if (status === 'locked' && samplePlayers === null) {
    return (
      <main className="gate">
        <GateForm onUnlocked={onUnlocked} />
      </main>
    );
  }

  const access: Access = { full: status === 'unlocked', samplePlayers: samplePlayers ?? [], openGate: () => setGateOpen(true) };
  return (
    <AccessContext.Provider value={access}>
      {/* Remount on unlock so every page reloads its data from the full set. */}
      <Fragment key={status}>{children}</Fragment>
      {gateOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={ko.gate.title} onClick={() => setGateOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <GateForm onUnlocked={onUnlocked} onCancel={() => setGateOpen(false)} />
          </div>
        </div>
      )}
    </AccessContext.Provider>
  );
}

function GateForm({ onUnlocked, onCancel }: { onUnlocked: () => void; onCancel?: () => void }) {
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (await unlock(password, remember)) onUnlocked();
      else setError(ko.gate.wrongPassword);
    } catch {
      setError(ko.gate.loadError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card"
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel?.();
      }}
    >
      <h1>{ko.gate.title}</h1>
      <p className="muted">{ko.gate.description}</p>
      <label htmlFor="pw">{ko.gate.passwordLabel}</label>
      <input
        id="pw"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-describedby={error ? 'pw-error' : undefined}
      />
      <label className="check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        {ko.gate.remember}
      </label>
      {error && (
        <p id="pw-error" className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" disabled={busy || !password}>
          {busy ? ko.gate.checking : ko.gate.submit}
        </button>
        {onCancel && (
          <button type="button" className="link" onClick={onCancel}>
            {ko.gate.cancel}
          </button>
        )}
      </div>
    </form>
  );
}

/** Shown in place of a page that only the full version has. */
export function FullOnly() {
  const { openGate } = useAccess();
  return (
    <main className="page">
      <p>{ko.gate.fullOnly}</p>
      <button type="button" onClick={openGate}>
        {ko.gate.fullVersion}
      </button>
    </main>
  );
}
