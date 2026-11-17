import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      overlay: false, // Evita que overlays de error bloqueen la pantalla del juego
    },
  },
});
