import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { PasswordGate } from './components/PasswordGate';
import { SearchBox } from './components/SearchBox';
import { Glossary } from './pages/Glossary';
import { Home } from './pages/Home';
import { Leaderboard } from './pages/Leaderboard';
import { Player } from './pages/Player';
import { ko } from './i18n/ko';
import { isPublicMode, lock } from './lib/loadData';
import './styles.css';

export function App() {
  return (
    <PasswordGate>
      <header className="topbar">
        <NavLink to="/" className="brand">
          {ko.siteName}
        </NavLink>
        <nav>
          <NavLink to="/leaderboard">{ko.nav.leaderboard}</NavLink>
          <NavLink to="/glossary">{ko.nav.glossary}</NavLink>
        </nav>
        <SearchBox />
        {!isPublicMode && (
          <button
            className="link"
            onClick={() => {
              lock();
              location.reload();
            }}
          >
            {ko.common.lock}
          </button>
        )}
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/player/:slug" element={<Player />} />
        <Route path="/glossary" element={<Glossary />} />
        <Route path="*" element={<main className="page"><p>{ko.common.notFound}</p></main>} />
      </Routes>
    </PasswordGate>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>,
  );
}
