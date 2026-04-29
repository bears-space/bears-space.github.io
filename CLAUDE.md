# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a website for BEARS built with Astro.js and Tailwind CSS v4. The project uses a minimal Astro setup with file-based routing.

## Development Commands

Run commands from the project root:

- `npm run dev` - Start development server at localhost:4321
- `npm run build` - Build production site to ./dist/
- `npm run preview` - Preview production build locally
- `npm run astro -- --help` - Get help with Astro CLI commands
- `npm run dev:admin` - Start dev server with Keystatic admin UI enabled (visit /keystatic)
- `npm run build:admin` - Build the admin-mode variant (hybrid output + Cloudflare adapter) for the admin subdomain deploy

**Important for Claude Code**: If you start a development server (e.g., `npm run dev`) during a task, you MUST stop it before completing the task. Use the KillShell tool with the appropriate shell ID to terminate background processes. This prevents resource accumulation across multiple prompts.

## Architecture

### Technology Stack
- **Framework**: Astro.js 5.x (SSG/hybrid rendering)
- **Styling**: Tailwind CSS v4 (via Vite plugin)
- **Interactivity**: Alpine.js for lightweight client-side JavaScript features
- **TypeScript**: Strict mode enabled (extends astro/tsconfigs/strict)

### Project Structure
```
src/
├── pages/          # File-based routing - each .astro or .md file becomes a route
│   └── de/         # German locale wrappers (thin re-renders of root pages)
├── layouts/        # Layout components (BaseLayout.astro imports global styles)
├── utils/          # Helpers (contentQueries.ts, i18n.ts, imageLoader, etc.)
└── styles/         # global.css imports Tailwind
```

### Key Configuration
- Astro config: [astro.config.mjs](astro.config.mjs) - Tailwind integrated via Vite plugin. Branches on `ADMIN_BUILD` env var to produce the admin build variant.
- TypeScript: [tsconfig.json](tsconfig.json) - Strict Astro configuration
- Global styles: [src/styles/global.css](src/styles/global.css) - Single Tailwind import
- Layout: [src/layouts/BaseLayout.astro](src/layouts/BaseLayout.astro) - Imports global.css
- Keystatic config: [keystatic.config.ts](keystatic.config.ts) - CMS schema mirroring the Astro content collections

### Dual deploy: public site (GitHub Pages) + admin UI (Cloudflare Pages)

The public site and the Keystatic admin UI are **deployed separately from the same repo**, and each domain only serves its own surface — there is no overlap:

| Domain | Build | What it serves | What it doesn't |
|---|---|---|---|
| `bears-space.de` (GitHub Pages, static) | `npm run build` | Landing page, all public marketing/content pages, `/docs`, sitemap | No `/admin`, no `/keystatic` (not emitted at all) |
| `admin.bears-space.de` (Cloudflare Pages, SSR via `@astrojs/cloudflare`) | `npm run build:admin` (sets `ADMIN_BUILD=true`) | Admin dashboard at `/`, Keystatic CMS at `/keystatic` | Every other path 301-redirects to `bears-space.de` |

**How the split is enforced:**

- `src/pages/index.astro` branches on `import.meta.env.ADMIN_BUILD` — renders the admin dashboard component on the admin build, the landing page component on the public build. The flag is injected at build time via `vite.define` in [astro.config.mjs](astro.config.mjs), so each bundle only carries the branch it needs (after dead-code elimination).
- The dashboard and landing live as components in `src/components/admin/AdminDashboard.astro` and `src/components/landing/LandingPage.astro`. There is no longer a separate `src/pages/admin.astro`.
- Dynamic content routes (`/events/[slug]`, `/projects/[slug]`, `/docs/[...slug]` plus their `de/` wrappers) declare `export const prerender = import.meta.env.ADMIN_BUILD !== true;`. Public build prerenders them as static HTML; admin build flips them to SSR so middleware can intercept.
- [src/middleware.ts](src/middleware.ts) handles the gating on the admin runtime: `/admin*` → 301 to `/`, anything outside `/`, `/keystatic*`, and asset paths (`/_astro`, `/_image`, `/favicon*`, anything with a file extension) → 301 to `https://bears-space.de` + path. Middleware doesn't run for prerendered pages, which is why we flip dynamic routes to SSR in the admin build.
- Sitemap integration is omitted from the admin build — admin pages should never be indexed.

Both builds read/write the **same content files** under `src/content/` — Keystatic never maintains its own database. The editor flow is:

```
Editor → admin.bears-space.de/ (dashboard) → /keystatic → Keystatic commits to main
  → GitHub Actions rebuilds public site → gh-pages → bears-space.de
```

Editors should always use the admin subdomain; the main site has no editing surface and never will.

#### Adding or changing content collection schemas

When you modify a content collection's schema, update **both** files in the same commit:

1. `src/content/config.ts` — Astro's Zod schema, source of truth for validation at build time.
2. `keystatic.config.ts` — Keystatic's editor schema, controls the admin UI.

Field names and types must match. Some Zod features (`.refine()`, `.transform()`, discriminated unions) don't have direct Keystatic equivalents — use `fields.conditional()` where possible, otherwise rely on Astro build-time validation to catch bad data.

After any schema edit, run `npm test`. The suite at `src/utils/__tests__/keystaticSchema.test.ts` uses Keystatic's Reader API to validate every content file against `keystatic.config.ts` — catching drift before editors see it in the admin UI. See [docs/dev/keystatic-testing](src/content/docs/dev/keystatic-testing.mdx).

#### `fields.image` publicPath — admin preview gotcha

Keystatic stores image values as `publicPath + uploadedFilename` verbatim and the admin UI renders previews by feeding that stored value straight into an `<img src>`. For the preview to resolve, the stored value must be a URL the dev server can serve — **not** a bare filename.

Rules for setting `publicPath` on any `fields.image`:

- Assets under `src/assets/<dir>/`: use `publicPath: '/src/assets/<dir>/'` so the stored value is `/src/assets/<dir>/<file>` (Vite serves it in dev, Astro's image pipeline handles it at build).
- Assets under `public/`: use `publicPath: '/'` so the stored value is `/<file>` (served at the site root).
- Per-entry subfolder uploads (events, projects, sponsors, people — one folder per slug): `publicPath: ''` is fine as long as the stored value ends up starting with `/` (Keystatic writes `/<slug>/<file>`, resolvable relative to `directory`). If a NEW field you add does not use the per-entry subfolder pattern, DO NOT copy `publicPath: ''` — use one of the two rules above or the preview will break.

When you change `publicPath` on an existing field, update any consumer that prepends its own `/` (so you don't end up with `//favicon.png`) and make sure the runtime path resolver (`resolveImagePath` in `src/utils/imageLoader.ts`) handles both the bare and absolute shapes — it already short-circuits on values starting with `/src/`. Also re-seed any manually-written YAML to match the new stored format.

Helpers in `keystatic.config.ts`:
- `brandingAssetField(label, directory)` — singleton fields pointing at `src/assets/<dir>/`.
- `publicAssetField(label)` — singleton fields pointing at `public/`.
- `imageField(label, directory, _publicPath)` — legacy helper for per-entry subfolder uploads (stores bare path). Note: the third arg is currently unused; don't read too much into it.

#### Keystatic collection mapping

The 12 Astro collections fan out into ~90 Keystatic collections + singletons (split per locale, per tier, and per file for page-text):

| Astro collection | Keystatic items |
|---|---|
| `sponsors` | `sponsorsDiamond`, `sponsorsPlatinum`, `sponsorsGold`, `sponsorsSilver`, `sponsorsBronze` |
| `events` | `eventsEn`, `eventsDe` |
| `projects` | `projectsEn`, `projectsDe` — `person` field is a `reference('people')` (the project's first cross-collection relationship) |
| `hero-slides` | `heroSlides` |
| `page-text` | One Keystatic singleton per `.mdx` file, scoped to a "shape" schema that only exposes the fields that file uses (page header, section, section-with-button, crosslink, list section, title-only, latest-news, legal page). See the singleton names in [keystatic.config.ts](keystatic.config.ts). Plus `pageTextNavLinksEn`/`De` (collection for the two nav-link list entries). |
| `instagram` | `instagram` |
| `people` | `people` — locale-agnostic, one entry per person. Roles translate inline via `roleEn`/`roleDe`. Powers two surfaces from one record: the Faces of BEARS grid (when `showInFaces: true`) and project Meet the Team callouts (via `projects.person`). Also referenced by the `testimonials` singleton. |
| `testimonials` | `testimonials` — single-entry `content` collection at `src/content/testimonials/list.mdx` (body is empty and not editable). Managed as a Keystatic singleton containing a `fields.array` of `{ person: relationship, quoteEn, quoteDe }`. Array order is display order (drag-to-reorder in the admin). |
| `social-platforms` | `socialPlatforms` — one entry per platform (Instagram, LinkedIn, YouTube, …). Each entry owns a `label`, an `iconFile` (SVG under `src/assets/social-icons/<slug>/`) and an optional `defaultHoverColor`. Referenced from `socialLinks[].platform` on the `social` page-text singletons — editors add/remove platforms here instead of hand-editing code. |
| `docs` | `docsGuides`, `docsDev` |
| `branding` | `branding` — locale-agnostic singleton ("Branding / logos", under the Site-wide group). Holds the three brand logos (`headerLogo`, `footerLogo`, `heroLogo`) plus `favicon` and `ogDefault` (both stored in `public/` and referenced as root-level URLs). Logo filenames resolve through the matching glob in `src/utils/imageGlobs.ts`; favicon/OG are served straight from `public/`. |
| `default-images` | `defaultImages` — sibling singleton ("Default images", same Site-wide group). Holds the four cover-image fallbacks (`defaultEventImage`, `defaultProjectImage`, `defaultSponsorImage`, `defaultFaceImage`) that get used when an event/project/sponsor/person has no custom image. Resolved via the `defaultImages` glob. |

The bilingual split is purely organisational — both Keystatic collections write to the existing `en/`/`de/` subfolders. The sponsor tier split reflects the folder structure (`src/content/sponsors/{tier}/`). For page-text, every file has its own singleton with a tight schema — this keeps each editor form minimal (e.g. a crosslink file only shows title/button text/button link). The singletons are grouped in the admin navigation by page (Landing, About us, Contact, Events, Projects, Sponsors, Legal, Site-wide) so editors find content by the page it lives on.

#### MDX component registry

MDX components usable inside Keystatic's MDX editor are registered in [src/keystatic/mdxComponents.tsx](src/keystatic/mdxComponents.tsx). Each entry is a React **preview** of the matching Astro component — the real component renders at build time. When adding a new MDX component:

1. Create the `.astro` file in `src/components/mdx/` and export it from [src/components/mdx/index.ts](src/components/mdx/index.ts).
2. Add a matching entry to `mdxComponents.tsx` with field definitions and a `ContentView`/`NodeView`.
3. Imports are not allowed inside MDX files edited through Keystatic — the components are passed in externally via the MDX renderer.

#### Keystatic external setup (one-time)

These steps live outside the codebase and must be configured once before the admin deploy works in production:

1. **GitHub App** — run `npm run dev:admin` and visit `/keystatic/setup` to register a GitHub App against the repo. Generates `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET`.
2. **Cloudflare Pages project** — create a new Pages project connected to the repo. Build command: `npm run build:admin`. Output dir: `dist`. Add the three env vars from step 1.
3. **DNS** — add `admin.bears-space.de` as a custom domain on the Cloudflare Pages project.
4. **Access control** — in GitHub, restrict the app installation to the repo only. Only users with repo write access can log in to `/keystatic`. For tighter control, add a GitHub team named "content-editors" with just the editors.

### Routing & i18n
Astro uses file-based routing. Files in `src/pages/` automatically become routes:
- `src/pages/index.astro` → `/`
- `src/pages/about.astro` → `/about`
- `src/pages/blog/[slug].astro` → `/blog/:slug` (dynamic routes)

**Locale routing:** The site supports English (default, no prefix) and German (`/de/` prefix). Astro's built-in i18n is configured in `astro.config.mjs` with `prefixDefaultLocale: false`.

German pages live in `src/pages/de/` as thin wrappers that import and re-render the root page component:

```astro
---
// src/pages/de/about-us.astro
import Page from '../about-us.astro';
---
<Page />
```

For dynamic routes (`[slug].astro`), the wrapper re-exports `getStaticPaths`:

```astro
---
// src/pages/de/events/[slug].astro
import Page from '../../events/[slug].astro';
export { getStaticPaths } from '../../events/[slug].astro';
---
<Page {...Astro.props} />
```

Root pages detect their locale via `getLocale(Astro.url)` from `src/utils/i18n.ts` and pass it down to components and content queries. This means the same component code serves both languages.

### Styling Pattern
This project uses Tailwind CSS v4 with the Vite plugin. Global styles are imported via BaseLayout. Use Tailwind utility classes directly in Astro components.

**Mobile-First Design**: All new components and features should be designed with mobile devices in mind first. Use Tailwind's responsive breakpoints (sm, md, lg, xl) to progressively enhance for larger screens. Start with mobile styles as the base, then add breakpoint modifiers for larger screens.

**Responsive Breakpoint Strategy**: This website primarily uses `sm:` (640px) and `lg:` (1024px) as the main breakpoints for layout changes. Avoid using `md:` (768px) for major layout transitions, as the 768px-1024px range often creates awkward, cramped layouts on tablets. More granular controlled layouts with `md:` are often too fiddly and don't provide good user experience. Reserve `md:` for fine-tuning details like spacing or font sizes, not for major structural changes.

**Recommended breakpoint usage:**
- Base (mobile): Core layout and styling
- `sm:` (640px+): Small adjustments for larger phones
- `lg:` (1024px+): Major layout changes (column to row, single to multi-column grids)
- `xl:` (1280px+): Optional refinements for very large screens

Examples:
- Grid layouts: `grid-cols-1 lg:grid-cols-2` (skip md:)
- Flex direction: `flex-col lg:flex-row` (skip md:)
- Component sizing: Fine-tune with all breakpoints as needed

**Headline Spacing**: All h2 headlines should use consistent spacing below them (unless explicitly specified otherwise for a particular component). The standard spacing pattern for headlines is:
```
mb-8 sm:mb-10 lg:mb-14
```
This provides:
- Mobile (< 640px): 2rem (32px)
- Small screens (640px+): 2.5rem (40px)
- Large screens (1024px+): 3.5rem (56px)

This ensures a coherent visual rhythm across all sections of the website. Apply this spacing to all h2 headlines in components that appear on pages, maintaining consistency with the overall design system.

### Static Assets
Place static files (images, fonts, etc.) in the `public/` directory. They're served from the root path.

### Images and Astro's Image Component

This project uses Astro's `<Image/>` component for all images to enable automatic optimization, responsive image generation, and control over loading behavior.

**CRITICAL: No Remote Image URLs**
- **NEVER use remote URLs** (e.g., `https://placehold.co/...`, `https://via.placeholder.com/...`) for images
- **ALL images MUST be local files** stored in `/src/assets/`
- Placeholder images must be actual image files imported from `/src/assets/`

**Image Architecture:**
- All images are stored in `/src/assets/` with subdirectories:
  - `/src/assets/events/` - Event cover images
  - `/src/assets/projects/` - Project cover images
  - `/src/assets/sponsors/` - Sponsor logos
  - `/src/assets/testimonials/` - Testimonial portraits
- Components pass `ImageMetadata` objects (not URL strings) as props
- The `<Image/>` component handles optimization automatically

**Usage Pattern:**
```astro
---
import { Image } from 'astro:assets';
import placeholderImage from '../assets/events/event-1.jpg';
---

<Image
  src={placeholderImage}
  alt="Description"
  class="..."
  loading="lazy"  // or "eager" for above-the-fold
  format="webp"
/>
```

**Loading Strategy:**
- Use `loading="eager"` for above-the-fold images (e.g., cover images on detail pages)
- Use `loading="lazy"` for below-the-fold images (e.g., cards, carousels, logos)

**Img and Responsive Sizing:**

When using `Img`, provide a `sizes` prop when the display size can be calculated. This helps the browser load appropriately sized images from the srcset.

Examples:
- For marquees/carousels with known image count: `sizes={`calc(100vh / ${images.length})`}`
- For grid layouts: `sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"`
- For fixed-width containers: `sizes="300px"`

The `sizes` prop tells the browser the expected display width, allowing it to select the optimal image from the generated srcset without downloading unnecessarily large files.

### MDX Components

When creating reusable components intended for use in `.mdx` files, consider supporting Markdown input for string content properties. This allows content creators to format text with rich styling (bold, lists, links, code blocks, etc.) without writing HTML.

**When to support Markdown:**
- Components with string content properties (e.g., `content`, `description`, `text`)
- Not needed for components using slots, where content comes from MDX as JSX/HTML
- Typical examples: components that display collapsible content, cards with descriptions, tooltips

**Implementation Pattern:**

Use the `markdownToHtml` utility from [src/utils/markdown.ts](src/utils/markdown.ts) to process Markdown strings server-side:

```astro
---
import { markdownToHtml } from '../../utils/markdown';

interface Props {
  items: Array<{
    title: string;
    content: string;  // Markdown format
  }>;
}

const { items } = Astro.props;

// Process Markdown to HTML server-side
const processedItems = await Promise.all(
  items.map(async (item) => ({
    ...item,
    content: await markdownToHtml(item.content)
  }))
);
---

<div>
  {processedItems.map((item) => (
    <div set:html={item.content} />
  ))}
</div>
```

**Reference Implementation:**
See [Accordion.astro](src/components/mdx/Accordion.astro) for a complete example of Markdown support in a reusable component. It accepts content in Markdown format and processes it server-side for optimal performance.

### Editable Page Content

Static text in components and pages — such as headings, descriptions, and button labels — should be sourced from `.mdx` files in the `page-text` content collection (`src/content/page-text/`) rather than hardcoded, when useful and practical. This allows content creators to update copy without touching component code.

**Locale folder structure:**
Content files are organized under `en/` and `de/` subfolders. Within each locale folder, the subfolder conventions are:
- `landing/` — content for homepage sections (e.g., `landing/what-is-bears`)
- Each page has its own subfolder (e.g., `about-us/`, `events/`, `sponsors/`)
- Page hero title/subtitle files use a `-title` suffix (e.g., `events/events-title`)
- Section-specific content goes alongside the title file (e.g., `about-us/our-mission`, `about-us/find-us`)

```
src/content/page-text/
├── en/                  ← English (default)
│   ├── about-us/our-mission.mdx
│   ├── landing/what-is-bears.mdx
│   ├── hero.mdx                ← outlier singletons at locale root
│   ├── faq.mdx
│   ├── nav-links/header.mdx    ← multi-entry outlier collection
│   └── ...
└── de/                  ← German translations
    └── ... (same structure as en/)
```

Outlier shapes (hero, FAQ, nav-columns, social, donate, nav-links) live as dedicated `.mdx` files at the locale root (or under `nav-links/`) so Keystatic can surface each through a dedicated editor form instead of one giant flat schema. The Media page splits into `media/media-title.mdx` (page header + SEO) and `media/media-categories.mdx` (category list), each driven by its own singleton. See `keystatic.config.ts` for the full mapping.

**Querying content:**
Use `getPageContent(id, locale)` from `src/utils/contentQueries.ts` to fetch a page content entry by its ID. The `id` does NOT include the locale prefix — the function prepends it automatically and falls back to English if the translation is missing:

```astro
---
import { getPageContent } from '../utils/contentQueries';
import { getLocale } from '../utils/i18n';

const locale = getLocale(Astro.url);
const content = await getPageContent('events/events-title', locale);
---

<h2>{content.data.title}</h2>
<p>{content.data.description}</p>
```

**When to extract content:** Not every string needs to be pulled into a content file. Use this pattern for user-facing text that content creators are likely to want to edit (section headings, intro paragraphs, CTA labels). Internal labels, aria attributes, and structural text can stay hardcoded.

**Adding translations:** When creating or editing page text, update both `en/` and `de/` versions. If a German translation is missing, the English version is shown automatically.

## Documentation

All documentation lives in `src/content/docs/` as a content collection, served at `/docs/` on the website. Files are `.mdx` (MDX allows embedding components like `<Callout>`, `<Img>`, `<Accordion>` in prose).

- **Guides** (`src/content/docs/guides/`): User-facing guides for content creators
- **Dev Docs** (`src/content/docs/dev/`): Technical reference for developers

Documentation pages use `DocsLayout.astro` with a sidebar navigation auto-generated from the collection. Each doc file has frontmatter with `title`, `description` (optional), and `order` (numeric sort order within its section).

**Important**: When you make code changes that affect documented behavior or data structures, update the corresponding doc file in `src/content/docs/`.

### When to Update Documentation

Update documentation files when:
- Changing content collection schemas (e.g., adding/removing frontmatter fields)
- Modifying sort/filter logic (e.g., how items are ordered)
- Changing file organization or naming conventions
- Updating asset paths or directory structures
- Modifying how content is displayed or validated
- Adding or changing MDX component props or behavior
