import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Proxy de dev vers l'ENT local (traefik :8090)
const proxyTarget = { target: 'http://localhost:8090', changeOrigin: false };

export default defineConfig(({ mode }) => ({
  // Servi sous /competences par entcore (cf. view/competences-react.html -> /competences/public/index-<hash>.js)
  base: mode === 'production' ? '/competences' : '',
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'react-i18next',
      'i18next',
      'react-router-dom',
      '@open-ent/client',
      '@open-ent/react',
      '@open-ent/bootstrap',
    ],
    alias: {
      // Illustrations du socle (écrans vides), comme dans blog, calendar et exercizer.
      '@images': resolve(__dirname, 'node_modules/@open-ent/bootstrap/dist/images'),
    },
  },
  build: {
    assetsDir: 'public',
    rollupOptions: {
      output: {
        /**
         * Tout porte une empreinte de contenu, y compris l'entrée — comme blog, wiki, video,
         * l'agenda et les exercices. La vue n'est donc pas écrite à la main : elle est GÉNÉRÉE
         * par Vite (`dist/index.html`, copiée en `view/competences-react.html`) et référence les
         * fichiers empreintés. Un nom d'entrée fixe était resservi par les navigateurs après un
         * déploiement.
         *
         * ⚠ Le dossier `public/` est PARTAGÉ avec l'IHM AngularJS (qui y dépose `dist/`, `js/`,
         * `css/`, `template/`) : les noms empreintés évitent toute collision.
         */
        entryFileNames: 'public/[name]-[hash].js',
        chunkFileNames: 'public/[name]-[hash].js',
        assetFileNames: 'public/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 4203,
    // Autorise la lecture des images/polices du paquet bootstrap (hors racine du projet).
    fs: { allow: ['../../'] },
    proxy: {
      '/competences': proxyTarget,
      '/viescolaire': proxyTarget,
      '^/(?=assets|theme|locale|i18n|skin)': proxyTarget,
      '^/(?=auth|userbook|directory|portal|session|timeline|workspace|infra|conf|applications-list)':
        proxyTarget,
    },
  },
  plugins: [react()],
}));
