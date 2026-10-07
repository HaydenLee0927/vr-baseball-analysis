import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ko } from '../i18n/ko';
import { isPublicMode, tryStoredKey, unlock } from '../lib/loadData';

type Status = 'checking' | 'locked' | 'unlocked';

export function PasswordGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(isPublicMode ? 'unlocked' : 'checking');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPublicMode) return;
    tryStoredKey()
      .then((ok) => setStatus(ok ? 'unlocked' : 'locked'))
      .catch(() => setStatus('locked'));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (await unlock(password, remember)) setStatus('unlocked');
      else setError(ko.gate.wrongPassword);
    } catch {
      setError(ko.gate.loadError);
    } finally {
      setBusy(false);
    }
  }

  if (status === 'unlocked') return <>{children}</>;
  if (status === 'checking') return <p className="center muted">{ko.common.loading}</p>;

  return (
    <main className="gate">
      <form className="card" onSubmit={onSubmit}>
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
        <button type="submit" disabled={busy || !password}>
          {busy ? ko.gate.checking : ko.gate.submit}
        </button>
      </form>
    </main>
  );
}
