import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { createFrontendCsp } from './security-policy.mjs';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

function frontendCspPlugin() {
  let isDevelopmentServer = false;

  return {
    name: 'frontend-content-security-policy',
    configResolved(config: { command: string }) {
      isDevelopmentServer = config.command === 'serve';
    },
    transformIndexHtml(html: string) {
      const connectSources = ["'self'"];
      if (isDevelopmentServer) {
        const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;
        const validDevDomain = replitDevDomain &&
          replitDevDomain.length <= 253 &&
          replitDevDomain.split('.').every((label) =>
            label.length > 0 &&
            label.length <= 63 &&
            /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/iu.test(label),
          );
        if (validDevDomain) {
          connectSources.push(`wss://${replitDevDomain}`);
        } else {
          connectSources.push(`ws://localhost:${port}`);
        }
      }

      const policy = createFrontendCsp(connectSources.join(' '));
      const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
      const transformed = html.replace(/<head([^>]*)>/iu, (head) => `${head}\n    ${meta}`);
      if (transformed === html) throw new Error("CSP could not be added: the HTML head is missing.");
      return transformed;
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    frontendCspPlugin(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
