# Astro.js Website for BEARS
>
> **TODO:** Write the privacy policy at `src/content/page-text/{en,de}/datenschutz/datenschutz.mdx` (currently both stubs say "Coming soon!"). The following points need to be disclosed:
> - **Instagram embeds:** `embed.js` is loaded from Meta, transmits IP address and browser data to Meta Platforms Ireland Ltd
> - **OpenStreetMap map tiles:** IP address is transmitted to `openstreetmap.org` tile servers
> - **YouTube embeds (nocookie):** Privacy-enhanced mode, but still connects to Google
> - **localStorage:** Used for docs sidebar UI state (purely functional, no tracking)
> - **No analytics tools or tracking cookies in use**

## Prerequisites

You need **Node.js** (v18 or later) and **npm** (bundled with Node.js).

1. Download and install Node.js from [nodejs.org](https://nodejs.org/) (the LTS version is recommended).
2. Verify the installation by opening a terminal and running:
   ```sh
   node -v
   npm -v
   ```
   Both commands should print a version number.

## Local Quickstart

```sh
npm install
npm run dev
```

## Deployment

The repo produces **two separate deploys** from the same source tree. The public pages are pure static HTML/CSS/JS, which GitHub Pages serves for free — but the admin UI's `/keystatic` and `/api/keystatic/*` routes need server-side rendering (OAuth callback + GitHub commit handler), and GitHub Pages doesn't support that. The admin therefore runs on Cloudflare Pages with an SSR adapter, while the public site stays on GitHub Pages.

- **Public site** — `bears-space.de`, deployed to GitHub Pages. Purely static, built with `npm run build`. This is what end users see.
- **Admin UI** — `admin.bears-space.de`, deployed to Cloudflare Pages. Astro `output: 'server'` with the `@astrojs/cloudflare` adapter, built with `npm run build:admin` (sets `ADMIN_BUILD=true`). Serves `/keystatic` for content editors.

Both builds read and write the same files under `src/content/`. Editors save through `admin.bears-space.de/keystatic` → Keystatic commits to `main` via a GitHub App → GitHub Actions rebuilds the public site. The admin site never maintains its own database.

One-time setup for the admin deploy (GitHub App, Cloudflare Pages project, DNS, access control) is documented in [CLAUDE.md](CLAUDE.md).

## Adding New Content

Content editors normally work through the admin UI at `admin.bears-space.de/keystatic` — Keystatic commits the edits for you. The steps below are for developers making content changes directly in the codebase.

When adding or editing content (events, projects, sponsors, page text, etc.), **always work on a new branch** — never commit directly to `main`.

1. Create a new branch before making changes:
   ```sh
   git checkout -b my-content-update
   ```
2. Make your changes, then commit them:
   ```sh
   git add .
   git commit -m "Add new event: Spring Workshop 2026"
   ```
3. Push your branch:
   ```sh
   git push -u origin my-content-update
   ```
4. *(Optional)* If you're comfortable with GitHub, you can open a **Pull Request** on GitHub to have your changes reviewed before they go live.

## If Something Breaks

Every save through the admin UI becomes a Git commit, so almost any editing mistake can be undone with one click:

1. Go to [github.com/bears-space/bears-space.github.io/commits/main](https://github.com/bears-space/bears-space.github.io/commits/main).
2. Find the bad commit (usually the most recent one).
3. Click the `...` menu on it → **Revert**. Merge the PR GitHub opens.

The site rebuilds from the previous state within a few minutes. See the [If Something Breaks guide](src/content/docs/guides/if-something-breaks.mdx) for details and when to escalate.

## Project Structure

```text
/
├── public/                  # Static assets (favicon, etc.)
├── src/
│   ├── assets/              # Images organized by content type
│   │   ├── about-us/        # About page section images (our-mission/)
│   │   ├── default-images/  # Placeholder/fallback images
│   │   ├── events/          # Event cover images
│   │   ├── footer/          # Footer logo variants
│   │   ├── header/          # Header logo variants
│   │   ├── hero/            # Hero images by page (about-us/, events/, etc.)
│   │   ├── people/          # Person portraits (Faces of BEARS + Meet the Team)
│   │   ├── projects/        # Project cover images
│   │   ├── social-icons/    # Social platform icons (per-platform subfolder)
│   │   ├── sponsors/        # Sponsor logos by tier (diamond/, gold/, etc.)
│   │   ├── testimonials/    # Testimonial portraits
│   │   └── whatIsBears/     # "What is BEARS" section images
│   │
│   ├── components/          # Astro components
│   │   ├── about/           # About page sections
│   │   ├── contact/         # Contact page components
│   │   ├── docs/            # Documentation page components
│   │   ├── events/          # Events page components
│   │   ├── landing/         # Homepage sections
│   │   ├── layout/          # Header, Footer, BackToTop
│   │   ├── mdx/             # Components for use in MDX content
│   │   ├── post/            # Event/project detail page components
│   │   ├── posts-catalog/   # Listing pages: cards, filters, pagination
│   │   ├── projects/        # Projects page components
│   │   ├── reusable/        # Generic reusable UI components
│   │   └── sponsors/        # Sponsors page components
│   │
│   ├── content/             # Astro content collections
│   │   ├── branding/        # Brand logos, favicon, OG default (singleton)
│   │   ├── default-images/  # Fallback cover images (singleton)
│   │   ├── docs/            # Documentation pages (guides/, dev/)
│   │   ├── events/          # Event entries (.md/.mdx)
│   │   │   ├── en/          #   English (default)
│   │   │   └── de/          #   German translations
│   │   ├── hero-slides/     # Landing page hero carousel slides
│   │   ├── instagram/       # Instagram feed entries
│   │   ├── page-text/       # Editable page copy by section
│   │   │   ├── en/          #   English (default)
│   │   │   │   ├── 404/
│   │   │   │   ├── about-us/
│   │   │   │   ├── contact/
│   │   │   │   ├── datenschutz/
│   │   │   │   ├── events/
│   │   │   │   ├── imprint/
│   │   │   │   ├── landing/          # Homepage sections
│   │   │   │   ├── nav-links/
│   │   │   │   ├── media/             # Media page (media-title + media-categories)
│   │   │   │   ├── projects/
│   │   │   │   ├── site/
│   │   │   │   ├── sponsors/
│   │   │   │   └── *.mdx             # Outlier singletons at locale root:
│   │   │   │                         #   hero, faq, social, donate, nav-columns
│   │   │   └── de/          #   German translations (same structure)
│   │   ├── people/          # People (Faces of BEARS + project leads, locale-agnostic)
│   │   ├── projects/        # Project entries (.md/.mdx)
│   │   │   ├── en/          #   English (default)
│   │   │   └── de/          #   German translations
│   │   ├── social-platforms/ # Social platforms (Instagram, LinkedIn, YouTube, …)
│   │   ├── sponsors/        # Sponsor entries by tier (diamond/, gold/, etc.)
│   │   ├── testimonials/    # Testimonial entries
│   │   │   ├── en/          #   English (default)
│   │   │   └── de/          #   German translations
│   │   └── config.ts        # Collection schemas (Zod)
│   │
│   ├── keystatic/           # MDX component registry for the Keystatic editor
│   ├── layouts/             # Page layouts (BaseLayout, DocsLayout, PostLayout)
│   ├── pages/               # File-based routing (English, default locale)
│   │   ├── de/              # German locale wrappers (re-render root pages)
│   │   │   ├── index.astro  #   Each file imports + renders the root page
│   │   │   ├── events/[slug].astro
│   │   │   └── ...          #   about-us, projects, sponsors, contact, etc.
│   │   ├── docs/[...slug].astro   # Documentation pages (English only)
│   │   ├── events/[slug].astro    # Dynamic event detail pages
│   │   └── projects/[slug].astro  # Dynamic project detail pages
│   ├── styles/              # Global CSS (Tailwind v4)
│   ├── types/               # TypeScript type definitions
│   └── utils/               # Helpers (content queries, image loading, etc.)
│       └── __tests__/       # Vitest unit tests
│
├── astro.config.mjs
├── keystatic.config.ts   # Keystatic CMS schema (mirrors src/content/config.ts)
├── wrangler.jsonc        # Cloudflare Pages deployment config (admin build)
├── vitest.config.ts
├── CLAUDE.md             # AI assistant instructions
├── package.json
└── tsconfig.json
```

## Internationalization (i18n)

The site supports two languages: **English** (default) and **German**.

- English pages live at the root URL (e.g., `/about-us`)
- German pages live under `/de/` (e.g., `/de/about-us`)

Localized content collections (`events`, `projects`, `page-text`, `testimonials`) use `en/` and `de/` subfolders. Collections that are language-neutral (`people`, `sponsors`, `instagram`, `hero-slides`) stay flat — `people` keeps role translation inline via `roleEn` / `roleDe`. If a German translation is missing, the English version is shown as fallback.

The language switcher in the header toggles between locales. Locale utilities live in `src/utils/i18n.ts`.

## Images

All images must be local files in `src/assets/` subdirectories — remote URLs are not supported. Accepted formats: `.jpg`, `.jpeg`, `.png`, `.webp`. Hero slides also accept video formats (`.mp4`, `.webm`, `.ogg`). See the [image system docs](src/content/docs/dev/image-system.mdx) for details on the loading pipeline and fallback behavior.

## Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run dev:admin`       | Dev server with Keystatic admin UI (visit `/keystatic`) |
| `npm run build`           | Build public site to `./dist/`                   |
| `npm run build:admin`     | Build admin variant for the Cloudflare Pages deploy |
| `npm run preview`         | Preview your build locally, before deploying    |
| `npm test`                | Run unit tests once                              |
| `npm run test:watch`      | Run unit tests in watch mode                     |
| `npm run typecheck`       | TypeScript type check (`tsc --noEmit`)           |
| `npm run compress-images` | Compress images in a path (also runs in pre-commit) |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |
