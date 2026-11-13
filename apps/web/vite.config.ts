import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { alphaTab } from '@coderline/alphatab-vite';

/** Lists every emitted bundle file in precache-manifest.json for the service worker (public/sw.js). */
function precacheManifest(): Plugin {
  return {
    name: 'g3d-precache-manifest',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map') && f !== 'index.html')
        .map((f) => `/${f}`)
        .sort();
      this.emitFile({ type: 'asset', fileName: 'precache-manifest.json', source: JSON.stringify(files) });
    },
  };
}

export default defineConfig({
  plugins: [react(), alphaTab(), precacheManifest()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': `http://localhost:${process.env.PORT ?? 3001}` },
  },
});
