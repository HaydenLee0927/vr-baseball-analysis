import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { PasswordGate } from './components/PasswordGate';
import { Home } from './pages/Home';
import { ko } from './i18n/ko';
import { isPublicMode, lock } from './lib/loadData';
import './styles.css';

function App() {
  return (
    <PasswordGate>
      <header className="topbar">
        <a href="#/" className="brand">
          {ko.siteName}
        </a>
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
      </Routes>
    </PasswordGate>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
