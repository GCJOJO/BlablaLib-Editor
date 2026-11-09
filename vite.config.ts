import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : le site reste hébergeable tel quel sur GitHub Pages, dans n'importe quel sous-dossier.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5183, strictPort: true },
});
