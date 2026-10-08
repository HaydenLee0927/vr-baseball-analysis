import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { chartServer } from './chart-server';

// Local-only charting tool: `npm run chart`. There is deliberately no build for it.
export default defineConfig({
  plugins: [react(), chartServer()],
  server: { port: 5174, open: '/chart.html' },
});
