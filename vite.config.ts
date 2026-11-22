import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        // `@` is the source root, not the project root, so an import of
        // `@/features/trading/types` says which module owns the thing and stays
        // correct when the importing file moves. `tsconfig.json` paths mirror it.
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true as const,
      hmr: false as const,
      ws: false as const,
      watch: null,
    },
  };
});
