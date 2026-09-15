import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiProxy = {
  '/api': {
    target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3001',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  /* Mot ban sao React duy nhat cho ca cay phu thuoc. Cac thu vien UI hoisted len
     node_modules goc (@mantine/core cua @blocknote/mantine, @tiptap, @radix-ui...)
     co the resolve sang mot React khac voi React cua client neu npm nested ban cua
     client xuong client/node_modules — hai instance React lam Context cross-realm
     va vo thanh "render is not a function". dedupe ep moi import ve mot ban. */
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    manifest: true,
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@dnd-kit')) return 'dnd';
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('lucide-react')) return 'icons';
          if (/node_modules\/(react|react-dom|react-router)\//.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    port: 5173,
    proxy: apiProxy,
  },
});
