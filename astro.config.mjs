// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

import tailwindcss from '@tailwindcss/vite';

import alpinejs from '@astrojs/alpinejs';

import mdx from '@astrojs/mdx';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

import keystatic from '@keystatic/astro';
import cloudflare from '@astrojs/cloudflare';

const ADMIN_BUILD = process.env.ADMIN_BUILD === 'true';

// `.env` values aren't auto-merged into process.env at config-load time, so
// read KEYSTATIC_STORAGE explicitly via Vite's loadEnv. Fallback to process.env
// for cases where the var is set via shell/cross-env instead of .env.
const dotEnv = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');
const KEYSTATIC_STORAGE = dotEnv.KEYSTATIC_STORAGE ?? process.env.KEYSTATIC_STORAGE ?? '';

const baseIntegrations = [alpinejs(), mdx(), react()];

// Sitemap is only meaningful for the public site; the admin deploy serves a
// single dashboard plus Keystatic and shouldn't advertise either to crawlers.
const publicOnlyIntegrations = [
  sitemap({
    filter: (page) => !page.includes('/docs/') && !page.includes('/keystatic'),
  }),
];

// https://astro.build/config
export default defineConfig({
  site: ADMIN_BUILD ? 'https://admin.bears-space.de' : 'https://bears-space.de',

  ...(ADMIN_BUILD
    ? {
        output: 'server',
        adapter: cloudflare(),
      }
    : {}),

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'de'],
    routing: { prefixDefaultLocale: false },
  },

  vite: {
    define: {
      'import.meta.env.ADMIN_BUILD': JSON.stringify(ADMIN_BUILD),
      'import.meta.env.KEYSTATIC_STORAGE': JSON.stringify(KEYSTATIC_STORAGE),
    },
    plugins: [tailwindcss()],
  },

  integrations: ADMIN_BUILD
    ? [...baseIntegrations, keystatic()]
    : [...baseIntegrations, ...publicOnlyIntegrations],
});
