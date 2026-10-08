import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './chart.css';

// CI fails the deploy if this string appears in the production build (see deploy.yml).
export const CHARTING_TOOL_MARKER = 'VRS_CHARTING_TOOL_LOCAL_ONLY';
document.documentElement.dataset.tool = CHARTING_TOOL_MARKER;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
