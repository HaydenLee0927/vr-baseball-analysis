import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site at /<repo-name>/; CI sets BASE_PATH to match.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
});
