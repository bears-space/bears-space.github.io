/**
 * Content Validation Tests
 *
 * These tests read the actual content files on disk and validate them
 * against the Zod schemas defined in src/content/config.ts.
 *
 * They catch problems that Astro's build would also catch, but with
 * much clearer error messages — so content creators can quickly fix
 * issues without needing to understand build logs.
 *
 * Run with: npm test
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, relative, extname, basename } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const yaml = require('js-yaml');
import { collections } from '../../content/config';
import { VALID_IMAGE_EXTENSIONS, VALID_VIDEO_EXTENSIONS } from '../imageConstants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = join(__dirname, '..', '..', '..');
const CONTENT_DIR = join(ROOT, 'src', 'content');
const ASSETS_DIR = join(ROOT, 'src', 'assets');

/** Recursively collect all files in a directory */
function collectFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

/** Parse YAML frontmatter from a markdown file */
function parseFrontmatter(filePath: string): Record<string, unknown> | null {
  const raw = readFileSync(filePath, 'utf-8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const parsed = yaml.load(match[1]);
  return typeof parsed === 'object' && parsed !== null
    ? (parsed as Record<string, unknown>)
    : {};
}

/** Human-readable path relative to project root */
function rel(filePath: string): string {
  return relative(ROOT, filePath);
}

/** Format Zod errors into readable messages */
function formatZodErrors(issues: { path: (string | number)[]; message: string }[]): string {
  return issues
    .map((issue) => {
      const field = issue.path.length > 0 ? `"${issue.path.join('.')}"` : '(root)';
      return `  - Field ${field}: ${issue.message}`;
    })
    .join('\n');
}

/** Filenames that are internal fallback/default images, not real content */
const PLACEHOLDER_FILENAMES = new Set(['placeholder.jpg', 'placeholder.png', 'placeholder.webp', 'placeholder.svg']);

/** List filenames in an asset directory, excluding internal placeholder/default images */
function listAssetFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => {
    const full = join(dir, f);
    return statSync(full).isFile() && !PLACEHOLDER_FILENAMES.has(f.toLowerCase());
  });
}

/**
 * Resolve a frontmatter image path against its collection asset dir, matching
 * what the runtime loaders in imageLoader.ts accept:
 *   - flat legacy:            "event-8.jpg"               → <dir>/event-8.jpg
 *   - Keystatic slug folder:  "/<slug>/coverImage.jpg"    → <dir>/<slug>/coverImage.jpg
 *   - Keystatic no leading /: "<slug>/coverImage.jpg"     → <dir>/<slug>/coverImage.jpg
 */
function resolveAssetPath(dir: string, value: string): string {
  return join(dir, value.replace(/^\/+/, ''));
}

// ---------------------------------------------------------------------------
// 1. File extension checks
// ---------------------------------------------------------------------------

const VALID_CONTENT_EXTENSIONS = new Set(['.md', '.mdx']);

describe('Content file extensions', () => {
  const contentCollections = [
    'events',
    'projects',
    'sponsors',
    'hero-slides',
    'instagram',
    'people',
    'page-text',
    'docs',
  ];

  for (const collection of contentCollections) {
    const dir = join(CONTENT_DIR, collection);
    if (!existsSync(dir)) continue;

    const files = collectFiles(dir);
    const nonConfig = files.filter((f) => basename(f) !== 'config.ts');

    if (nonConfig.length === 0) continue;

    it(`"${collection}" — all files should be .md or .mdx`, () => {
      const invalid = nonConfig.filter(
        (f) => !VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()),
      );

      expectWithMessage(
        invalid.length === 0,
        `Found files with invalid extensions in src/content/${collection}/.\n` +
        `Content files must be .md or .mdx, but these files have wrong extensions:\n\n` +
        invalid.map((f) => `  - ${rel(f)} (has "${extname(f)}" extension)`).join('\n') +
        `\n\nTo fix: rename these files to use .md or .mdx extension, or remove them from the content directory.`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Asset image extensions
// ---------------------------------------------------------------------------

const VALID_ASSET_EXTENSIONS = new Set(
  [...VALID_IMAGE_EXTENSIONS, ...VALID_VIDEO_EXTENSIONS].map((e) => `.${e.toLowerCase()}`),
);

describe('Asset file extensions', () => {
  // Each entry is `{ subdir, recurse }`. Recursive dirs (people, sponsors) are
  // walked into subfolders so per-slug Keystatic uploads are validated too.
  const assetDirs: { subdir: string; recurse?: boolean }[] = [
    { subdir: 'events' },
    { subdir: 'projects' },
    { subdir: 'sponsors/bronze' },
    { subdir: 'sponsors/silver' },
    { subdir: 'sponsors/gold' },
    { subdir: 'sponsors/platinum' },
    { subdir: 'sponsors/diamond' },
    { subdir: 'people', recurse: true },
    { subdir: 'hero/landingpage' },
  ];

  for (const { subdir, recurse } of assetDirs) {
    const dir = join(ASSETS_DIR, subdir);
    if (!existsSync(dir)) continue;

    const files = recurse
      ? collectFiles(dir).map((f) => relative(dir, f))
      : readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile());

    if (files.length === 0) continue;

    it(`"assets/${subdir}" — all files should be valid image/video formats`, () => {
      const invalid = files.filter(
        (f) => !VALID_ASSET_EXTENSIONS.has(extname(f).toLowerCase()),
      );

      expectWithMessage(
        invalid.length === 0,
        `Found files with unsupported formats in src/assets/${subdir}/.\n` +
        `Supported formats: ${[...VALID_IMAGE_EXTENSIONS, ...VALID_VIDEO_EXTENSIONS].map((e) => `.${e}`).join(', ')}\n\n` +
        `These files have unsupported extensions:\n` +
        invalid.map((f) => `  - ${f} (has "${extname(f)}" extension)`).join('\n') +
        `\n\nTo fix: convert these files to a supported format (e.g., .jpg, .png, .webp) or remove them.`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Frontmatter validation against Zod schemas
// ---------------------------------------------------------------------------

/**
 * Collections that use locale subfolders (en/, de/)
 */
const LOCALE_COLLECTIONS = ['events', 'projects', 'page-text'];

/**
 * Collections without locale subfolders. `people` is locale-agnostic by design:
 * one entry per person, with roleEn / roleDe stored inline.
 */
const FLAT_COLLECTIONS = ['sponsors', 'hero-slides', 'instagram', 'people'];

/** Mapping from collection name to its expected asset directory for image references */
const IMAGE_FIELD_TO_ASSET_DIR: Record<string, Record<string, string>> = {
  events: { coverImage: join(ASSETS_DIR, 'events') },
  projects: {
    coverImage: join(ASSETS_DIR, 'projects'),
  },
  people: { coverImage: join(ASSETS_DIR, 'people') },
  'hero-slides': { media: join(ASSETS_DIR, 'hero', 'landingpage') },
};

/** Sponsors have tier-based asset dirs */
function getSponsorAssetDir(filePath: string): string {
  const parts = relative(join(CONTENT_DIR, 'sponsors'), filePath).split('/');
  const tier = parts[0]; // bronze, silver, etc.
  return join(ASSETS_DIR, 'sponsors', tier);
}

/**
 * Helper: custom expect with readable error message.
 * Vitest doesn't have `.withContext()`, so we use a wrapper.
 */
function expectWithMessage(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

describe('Frontmatter validation', () => {
  // ---- Collections with locale folders ----
  for (const collection of LOCALE_COLLECTIONS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = (collections as any)[collection]?.schema;
    if (!schema || typeof schema.safeParse !== 'function') continue;

    const collectionDir = join(CONTENT_DIR, collection);
    if (!existsSync(collectionDir)) continue;

    const files = collectFiles(collectionDir).filter((f) =>
      VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()),
    );

    describe(`"${collection}" collection`, () => {
      for (const file of files) {
        const label = rel(file);

        it(`${label} — frontmatter should be valid`, () => {
          const frontmatter = parseFrontmatter(file);

          expectWithMessage(
            frontmatter !== null,
            `File "${label}" is missing frontmatter.\n\n` +
            `Every content file needs a YAML frontmatter block at the top:\n` +
            `  ---\n  title: "My Title"\n  ---\n\n` +
            `Add the required frontmatter fields to this file.`,
          );

          // Convert date strings to Date objects (YAML parses them as Date already, but just in case)
          if (frontmatter!.date && typeof frontmatter!.date === 'string') {
            frontmatter!.date = new Date(frontmatter!.date);
          }

          const result = schema.safeParse(frontmatter);

          expectWithMessage(
            result.success,
            `File "${label}" has invalid frontmatter.\n\n` +
            `The following fields have errors:\n` +
            (!result.success ? formatZodErrors(result.error.issues) : '') +
            `\n\nCheck the content guide for the required fields for "${collection}" entries.`,
          );
        });
      }
    });
  }

  // ---- Collections without locale folders ----
  for (const collection of FLAT_COLLECTIONS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = (collections as any)[collection]?.schema;
    if (!schema || typeof schema.safeParse !== 'function') continue;

    const collectionDir = join(CONTENT_DIR, collection);
    if (!existsSync(collectionDir)) continue;

    const files = collectFiles(collectionDir).filter((f) =>
      VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()),
    );

    describe(`"${collection}" collection`, () => {
      for (const file of files) {
        const label = rel(file);

        it(`${label} — frontmatter should be valid`, () => {
          const frontmatter = parseFrontmatter(file);

          expectWithMessage(
            frontmatter !== null,
            `File "${label}" is missing frontmatter.\n\n` +
            `Every content file needs a YAML frontmatter block at the top:\n` +
            `  ---\n  title: "My Title"\n  ---\n\n` +
            `Add the required frontmatter fields to this file.`,
          );

          if (frontmatter!.date && typeof frontmatter!.date === 'string') {
            frontmatter!.date = new Date(frontmatter!.date);
          }

          const result = schema.safeParse(frontmatter);

          expectWithMessage(
            result.success,
            `File "${label}" has invalid frontmatter.\n\n` +
            `The following fields have errors:\n` +
            (!result.success ? formatZodErrors(result.error.issues) : '') +
            `\n\nCheck the content guide for the required fields for "${collection}" entries.`,
          );
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 3b. Project-specific frontmatter edge cases
//
// The projects schema has conditional requirements that are easy to get wrong:
//   - displayMeetTheTeam: true  →  `person` slug is REQUIRED and must resolve
//   - isProjectCompleted is a required boolean (not optional)
//   - categoryProject must be one of the allowed enum values
// ---------------------------------------------------------------------------

describe('Project frontmatter edge cases', () => {
  const projectsDir = join(CONTENT_DIR, 'projects');
  if (!existsSync(projectsDir)) return;

  const files = collectFiles(projectsDir).filter((f) =>
    VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()),
  );

  const validCategories = ['experimental-rocketry', 'science-and-experiments', 'robotics', 'other'];

  // Resolve which person slugs exist on disk for cross-reference checks.
  const peopleDir = join(CONTENT_DIR, 'people');
  const peopleSlugs = existsSync(peopleDir)
    ? new Set(
        readdirSync(peopleDir)
          .filter((f) => VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()))
          .map((f) => f.replace(/\.mdx?$/i, ''))
      )
    : new Set<string>();

  for (const file of files) {
    const label = rel(file);
    const frontmatter = parseFrontmatter(file);
    if (!frontmatter) continue;

    // --- isProjectCompleted must be present ---
    it(`${label} — must have "isProjectCompleted" (true or false)`, () => {
      expectWithMessage(
        typeof frontmatter.isProjectCompleted === 'boolean',
        `File "${label}" is missing the required field "isProjectCompleted".\n\n` +
        `Every project must specify whether it is completed or not.\n\n` +
        `To fix: add one of these lines to the frontmatter:\n` +
        `  isProjectCompleted: true    (if the project is finished)\n` +
        `  isProjectCompleted: false   (if the project is still ongoing)`,
      );
    });

    // --- categoryProject must be a valid enum ---
    it(`${label} — "categoryProject" must be a valid category`, () => {
      expectWithMessage(
        typeof frontmatter.categoryProject === 'string' &&
        validCategories.includes(frontmatter.categoryProject as string),
        `File "${label}" has an invalid "categoryProject" value: "${frontmatter.categoryProject}".\n\n` +
        `Allowed values are:\n` +
        validCategories.map((c) => `  - "${c}"`).join('\n') +
        `\n\nTo fix: change "categoryProject" to one of the values listed above.`,
      );
    });

    // --- displayMeetTheTeam: true requires a `person` slug into the people collection ---
    if (frontmatter.displayMeetTheTeam === true) {
      it(`${label} — "displayMeetTheTeam: true" requires a "person" reference`, () => {
        expectWithMessage(
          typeof frontmatter.person === 'string' &&
          frontmatter.person.trim().length > 0,
          `File "${label}" has "displayMeetTheTeam: true" but is missing a "person" reference.\n\n` +
          `Meet the Team entries are linked to a person record in the People\n` +
          `collection (src/content/people/<slug>.mdx).\n\n` +
          `To fix: pick (or create) a person and reference their slug:\n` +
          `  person: "jane-doe"\n` +
          `Or set "displayMeetTheTeam: false" if you don't want to show the team section.`,
        );
      });

      it(`${label} — "person" must reference an existing entry in src/content/people/`, () => {
        const slug = (frontmatter.person as string | undefined)?.trim() ?? '';
        if (!slug) return; // covered by the previous test
        const available = [...peopleSlugs].sort().map((s) => `  - ${s}`).join('\n');
        expectWithMessage(
          peopleSlugs.has(slug),
          `File "${label}" references person slug "${slug}",\n` +
          `but no file was found at "src/content/people/${slug}.mdx".\n\n` +
          (peopleSlugs.size > 0
            ? `Available people slugs:\n${available}`
            : `The people collection is empty. Create a person first.`) +
          `\n\nTo fix: create the person file or update the slug to match an existing one.`,
        );
      });
    }

    // --- person without displayMeetTheTeam is dead data ---
    if (
      frontmatter.displayMeetTheTeam !== true &&
      typeof frontmatter.person === 'string' &&
      frontmatter.person.trim().length > 0
    ) {
      it(`${label} — "person" is set but "displayMeetTheTeam" is not true`, () => {
        expectWithMessage(
          false,
          `File "${label}" sets "person: ${frontmatter.person}" but won't display it:\n\n` +
          `The "person" reference only takes effect when "displayMeetTheTeam: true" is set.\n` +
          `Currently displayMeetTheTeam is ${frontmatter.displayMeetTheTeam === false ? 'false' : 'not set'}.\n\n` +
          `To fix: either set "displayMeetTheTeam: true" to show the team section,\n` +
          `or remove the unused "person" field to avoid confusion.`,
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 3c. Event-specific frontmatter edge cases
//
//   - title, description, date, categoryEvent, coverImage are all required
//   - categoryEvent must be a valid enum value
//   - coverImage must have a valid image extension
//   - date must be a valid date
//   - isDraft must be a boolean when provided
// ---------------------------------------------------------------------------

describe('Event frontmatter edge cases', () => {
  const eventsDir = join(CONTENT_DIR, 'events');
  if (!existsSync(eventsDir)) return;

  const files = collectFiles(eventsDir).filter((f) =>
    VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()),
  );

  const validCategories = [
    'trade-fairs-and-conventions',
    'competitions-and-workshops',
    'kick-off-events',
    'other',
  ];

  for (const file of files) {
    const label = rel(file);
    const frontmatter = parseFrontmatter(file);
    if (!frontmatter) continue;

    it(`${label} — must have a "title"`, () => {
      expectWithMessage(
        typeof frontmatter.title === 'string' && frontmatter.title.trim().length > 0,
        `File "${label}" is missing the required field "title".\n\n` +
        `Every event needs a title that will be shown as the event heading.\n\n` +
        `To fix: add a "title" field to the frontmatter:\n` +
        `  title: "My Event Name"`,
      );
    });

    it(`${label} — must have a "description"`, () => {
      expectWithMessage(
        typeof frontmatter.description === 'string' && frontmatter.description.trim().length > 0,
        `File "${label}" is missing the required field "description".\n\n` +
        `Every event needs a short description shown on event cards and previews.\n\n` +
        `To fix: add a "description" field to the frontmatter:\n` +
        `  description: "A short summary of this event."`,
      );
    });

    it(`${label} — must have a valid "date"`, () => {
      expectWithMessage(
        frontmatter.date instanceof Date ||
        (typeof frontmatter.date === 'string' && !isNaN(Date.parse(frontmatter.date as string))),
        `File "${label}" is missing or has an invalid "date" field.\n\n` +
        `Every event needs a date in YYYY-MM-DD format.\n\n` +
        `To fix: add a "date" field to the frontmatter:\n` +
        `  date: 2026-03-15`,
      );
    });

    it(`${label} — "categoryEvent" must be a valid category`, () => {
      expectWithMessage(
        typeof frontmatter.categoryEvent === 'string' &&
        validCategories.includes(frontmatter.categoryEvent as string),
        `File "${label}" has an invalid "categoryEvent" value: "${frontmatter.categoryEvent}".\n\n` +
        `Allowed values are:\n` +
        validCategories.map((c) => `  - "${c}"`).join('\n') +
        `\n\nTo fix: change "categoryEvent" to one of the values listed above.`,
      );
    });

    it(`${label} — "coverImage" must have a valid image extension`, () => {
      expectWithMessage(
        typeof frontmatter.coverImage === 'string' && frontmatter.coverImage.trim().length > 0,
        `File "${label}" is missing the required field "coverImage".\n\n` +
        `Every event needs a cover image filename.\n\n` +
        `To fix: add a "coverImage" field to the frontmatter:\n` +
        `  coverImage: "my-event.jpg"\n` +
        `  (place the image in src/assets/events/)`,
      );

      if (typeof frontmatter.coverImage === 'string') {
        const ext = extname(frontmatter.coverImage as string).toLowerCase().slice(1);
        const validExts = [...VALID_IMAGE_EXTENSIONS];

        expectWithMessage(
          validExts.includes(ext as typeof validExts[number]),
          `File "${label}" has "coverImage: ${frontmatter.coverImage}"\n` +
          `but ".${ext}" is not a supported image format.\n\n` +
          `Supported formats: ${validExts.map((e) => `.${e}`).join(', ')}\n\n` +
          `To fix: convert the image to a supported format (e.g., .jpg, .png, .webp)\n` +
          `and update the "coverImage" value.`,
        );
      }
    });

    if (frontmatter.isDraft !== undefined) {
      it(`${label} — "isDraft" must be a boolean when provided`, () => {
        expectWithMessage(
          typeof frontmatter.isDraft === 'boolean',
          `File "${label}" has "isDraft: ${frontmatter.isDraft}" but it must be true or false.\n\n` +
          `The "isDraft" field controls whether this event is visible on the website.\n\n` +
          `To fix: set isDraft to a boolean value:\n` +
          `  isDraft: true   (event is hidden)\n` +
          `  isDraft: false  (event is visible)`,
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 3d. Sponsor-specific frontmatter edge cases
//
//   - name and logo are required
//   - logo must have a valid image extension
//   - url must be a valid URL when provided
//   - tier is derived from folder — no "tier" field should be in frontmatter
// ---------------------------------------------------------------------------

describe('Sponsor frontmatter edge cases', () => {
  const sponsorsDir = join(CONTENT_DIR, 'sponsors');
  if (!existsSync(sponsorsDir)) return;

  const files = collectFiles(sponsorsDir).filter((f) =>
    VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()),
  );

  for (const file of files) {
    const label = rel(file);
    const frontmatter = parseFrontmatter(file);
    if (!frontmatter) continue;

    it(`${label} — must have a "name"`, () => {
      expectWithMessage(
        typeof frontmatter.name === 'string' && frontmatter.name.trim().length > 0,
        `File "${label}" is missing the required field "name".\n\n` +
        `Every sponsor needs a display name.\n\n` +
        `To fix: add a "name" field to the frontmatter:\n` +
        `  name: "Acme Corp"`,
      );
    });

    it(`${label} — must have a "logo" with valid image extension`, () => {
      expectWithMessage(
        typeof frontmatter.logo === 'string' && frontmatter.logo.trim().length > 0,
        `File "${label}" is missing the required field "logo".\n\n` +
        `Every sponsor needs a logo image filename.\n\n` +
        `To fix: add a "logo" field to the frontmatter:\n` +
        `  logo: "acme-logo.png"\n` +
        `  (place the image in the matching src/assets/sponsors/<tier>/ folder)`,
      );

      if (typeof frontmatter.logo === 'string') {
        const ext = extname(frontmatter.logo as string).toLowerCase().slice(1);
        const validExts = [...VALID_IMAGE_EXTENSIONS];

        expectWithMessage(
          validExts.includes(ext as typeof validExts[number]),
          `File "${label}" has "logo: ${frontmatter.logo}"\n` +
          `but ".${ext}" is not a supported image format.\n\n` +
          `Supported formats: ${validExts.map((e) => `.${e}`).join(', ')}\n\n` +
          `To fix: convert the logo to a supported format and update the "logo" value.`,
        );
      }
    });

    if (frontmatter.url !== undefined) {
      it(`${label} — "url" must be a valid URL when provided`, () => {
        let isValid = false;
        try {
          new URL(frontmatter.url as string);
          isValid = true;
        } catch { /* invalid */ }

        expectWithMessage(
          isValid,
          `File "${label}" has "url: ${frontmatter.url}" but it is not a valid URL.\n\n` +
          `Sponsor URLs must start with "https://" or "http://".\n\n` +
          `To fix: provide a full URL, e.g.:\n` +
          `  url: "https://example.com"`,
        );
      });
    }

    if ('tier' in frontmatter) {
      it(`${label} — should NOT have a "tier" field (tier is derived from folder)`, () => {
        expectWithMessage(
          false,
          `File "${label}" has a "tier" field in its frontmatter, but this is not needed.\n\n` +
          `The sponsor tier is automatically determined by the folder the file is in:\n` +
          `  src/content/sponsors/bronze/  →  Bronze tier\n` +
          `  src/content/sponsors/silver/  →  Silver tier\n` +
          `  src/content/sponsors/gold/    →  Gold tier\n` +
          `  ...and so on.\n\n` +
          `To fix: remove the "tier" field from the frontmatter. Move the file to\n` +
          `a different tier folder if you want to change the sponsor's tier.`,
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 3e. Hero slides frontmatter edge cases
//
//   - type must be "image" or "video"
//   - media is required with valid image/video extension
//   - alt is required when type is "image"
// ---------------------------------------------------------------------------

describe('Hero slides frontmatter edge cases', () => {
  const heroSlidesDir = join(CONTENT_DIR, 'hero-slides');
  if (!existsSync(heroSlidesDir)) return;

  const files = collectFiles(heroSlidesDir).filter((f) =>
    VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()),
  );

  for (const file of files) {
    const label = rel(file);
    const frontmatter = parseFrontmatter(file);
    if (!frontmatter) continue;

    const media = frontmatter.media as { discriminant?: unknown; value?: unknown } | undefined;

    it(`${label} — "media" must be a { discriminant, value } object`, () => {
      expectWithMessage(
        typeof media === 'object' && media !== null &&
          (media.discriminant === 'image' || media.discriminant === 'video') &&
          typeof media.value === 'string' && media.value.trim().length > 0,
        `File "${label}" has an invalid "media" field.\n\n` +
        `Hero slides now store media as a conditional object so the Keystatic admin\n` +
        `can render an image preview or a video file picker depending on the type.\n\n` +
        `To fix: update the frontmatter to:\n` +
        `  media:\n` +
        `    discriminant: image   # or "video"\n` +
        `    value: /<slug>/media.jpg`,
      );
    });

    if (media && typeof media.value === 'string') {
      const mediaExt = extname(media.value).toLowerCase().slice(1);
      const imageExts = [...VALID_IMAGE_EXTENSIONS].map((e) => e.toLowerCase());
      const videoExts = [...VALID_VIDEO_EXTENSIONS].map((e) => e.toLowerCase());
      const isImageExt = imageExts.includes(mediaExt);
      const isVideoExt = videoExts.includes(mediaExt);

      it(`${label} — "media.value" must have a valid image or video extension`, () => {
        expectWithMessage(
          isImageExt || isVideoExt,
          `File "${label}" has "media.value: ${media.value}"\n` +
          `but ".${mediaExt}" is not a supported format.\n\n` +
          `Supported image formats: ${imageExts.map((e) => `.${e}`).join(', ')}\n` +
          `Supported video formats: ${videoExts.map((e) => `.${e}`).join(', ')}`,
        );
      });

      if ((media.discriminant === 'image' || media.discriminant === 'video') && (isImageExt || isVideoExt)) {
        it(`${label} — "media.discriminant: ${media.discriminant}" should match the file extension`, () => {
          const expected = isImageExt ? 'image' : 'video';
          expectWithMessage(
            media.discriminant === expected,
            `File "${label}" has "media.discriminant: ${media.discriminant}" but "media.value" has a ${expected} extension (.${mediaExt}).\n` +
            `Fix: set "media.discriminant: ${expected}".`,
          );
        });
      }
    }

    it(`${label} — must have an "alt" text`, () => {
      expectWithMessage(
        typeof frontmatter.alt === 'string' && frontmatter.alt.trim().length > 0,
        `File "${label}" is missing the required "alt" field.\n\n` +
        `Alt text is used as the slide's slug in the admin UI AND as the image's\n` +
        `alt attribute for accessibility.\n\n` +
        `To fix: add an "alt" field:\n` +
        `  alt: "The BEARS team at the 2026 launch event"`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 3f. Instagram post frontmatter edge cases
//
//   - url is required and must be a valid URL
//   - date is required
//   - isDraft must be a boolean when provided
// ---------------------------------------------------------------------------

describe('Instagram post frontmatter edge cases', () => {
  const instagramDir = join(CONTENT_DIR, 'instagram');
  if (!existsSync(instagramDir)) return;

  const files = collectFiles(instagramDir).filter((f) =>
    VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()),
  );

  for (const file of files) {
    const label = rel(file);
    const frontmatter = parseFrontmatter(file);
    if (!frontmatter) continue;

    it(`${label} — must have a valid "url"`, () => {
      let isValid = false;
      try {
        new URL(frontmatter.url as string);
        isValid = true;
      } catch { /* invalid */ }

      expectWithMessage(
        typeof frontmatter.url === 'string' && isValid,
        `File "${label}" has an invalid or missing "url" field: "${frontmatter.url}".\n\n` +
        `Every Instagram post needs a valid URL to the post.\n\n` +
        `To fix: add a full Instagram post URL:\n` +
        `  url: "https://www.instagram.com/p/ABC123/"`,
      );
    });

    it(`${label} — must have a valid "date"`, () => {
      expectWithMessage(
        frontmatter.date instanceof Date ||
        (typeof frontmatter.date === 'string' && !isNaN(Date.parse(frontmatter.date as string))),
        `File "${label}" is missing or has an invalid "date" field.\n\n` +
        `Every Instagram post needs a date in YYYY-MM-DD format.\n` +
        `This is used to sort posts chronologically.\n\n` +
        `To fix: add a "date" field to the frontmatter:\n` +
        `  date: 2026-03-15`,
      );
    });

    if (frontmatter.isDraft !== undefined) {
      it(`${label} — "isDraft" must be a boolean when provided`, () => {
        expectWithMessage(
          typeof frontmatter.isDraft === 'boolean',
          `File "${label}" has "isDraft: ${frontmatter.isDraft}" but it must be true or false.\n\n` +
          `To fix: set isDraft to a boolean value:\n` +
          `  isDraft: true   (post is hidden)\n` +
          `  isDraft: false  (post is visible)`,
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 3g. People frontmatter edge cases
//
//   - name, roleEn, roleDe, coverImage are all required
//   - coverImage must have a valid image extension
//   - showInFaces is a boolean (defaulted, but must be valid type when set)
//   - order is a number (defaulted, but must be valid type when set)
// ---------------------------------------------------------------------------

describe('People frontmatter edge cases', () => {
  const peopleDir = join(CONTENT_DIR, 'people');
  if (!existsSync(peopleDir)) return;

  const files = collectFiles(peopleDir).filter((f) =>
    VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()),
  );

  for (const file of files) {
    const label = rel(file);
    const frontmatter = parseFrontmatter(file);
    if (!frontmatter) continue;

    it(`${label} — must have a "name"`, () => {
      expectWithMessage(
        typeof frontmatter.name === 'string' && frontmatter.name.trim().length > 0,
        `File "${label}" is missing the required field "name".\n\n` +
        `Every person entry needs a display name.\n\n` +
        `To fix: add a "name" field to the frontmatter:\n` +
        `  name: "Jane Doe"`,
      );
    });

    it(`${label} — must have a "roleEn"`, () => {
      expectWithMessage(
        typeof frontmatter.roleEn === 'string' && frontmatter.roleEn.trim().length > 0,
        `File "${label}" is missing the required field "roleEn" (English role).\n\n` +
        `To fix: add a "roleEn" field to the frontmatter:\n` +
        `  roleEn: "Project Lead / 2026"`,
      );
    });

    it(`${label} — must have a "roleDe"`, () => {
      expectWithMessage(
        typeof frontmatter.roleDe === 'string' && frontmatter.roleDe.trim().length > 0,
        `File "${label}" is missing the required field "roleDe" (German role).\n\n` +
        `To fix: add a "roleDe" field to the frontmatter:\n` +
        `  roleDe: "Projektleitung / 2026"`,
      );
    });

    it(`${label} — "coverImage" must have a valid image extension when present`, () => {
      // coverImage is optional on people — when absent, the default-images
      // fallback is used. Only validate the extension when a value is given.
      if (typeof frontmatter.coverImage !== 'string' || frontmatter.coverImage.trim().length === 0) {
        return;
      }

      const ext = extname(frontmatter.coverImage as string).toLowerCase().slice(1);
      const validExts = [...VALID_IMAGE_EXTENSIONS];

      expectWithMessage(
        validExts.includes(ext as typeof validExts[number]),
        `File "${label}" has "coverImage: ${frontmatter.coverImage}"\n` +
        `but ".${ext}" is not a supported image format.\n\n` +
        `Supported formats: ${validExts.map((e) => `.${e}`).join(', ')}\n\n` +
        `To fix: convert the image to a supported format and update the "coverImage" value.`,
      );
    });

    if (frontmatter.showInFaces !== undefined) {
      it(`${label} — "showInFaces" must be a boolean`, () => {
        expectWithMessage(
          typeof frontmatter.showInFaces === 'boolean',
          `File "${label}" has "showInFaces: ${frontmatter.showInFaces}" but it must be true or false.`,
        );
      });
    }

    if (frontmatter.order !== undefined) {
      it(`${label} — "order" must be a number`, () => {
        expectWithMessage(
          typeof frontmatter.order === 'number',
          `File "${label}" has "order: ${frontmatter.order}" but it must be a number.`,
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 3h. Page-text frontmatter edge cases
//
//   - title is always required
//   - buttonText and buttonHref must always come as a pair
//   - secondButtonText and secondButtonHref must always come as a pair
//   - ctas must have at most 4 items
//   - socialLinks urls must be valid URLs
// ---------------------------------------------------------------------------

describe('Page-text frontmatter edge cases', () => {
  const pageTextDir = join(CONTENT_DIR, 'page-text');
  if (!existsSync(pageTextDir)) return;

  const files = collectFiles(pageTextDir).filter((f) =>
    VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()),
  );

  // Page-text files that are pure site-wide config and are not rendered as
  // a section heading. They are allowed to omit the `title` field so the CMS
  // does not surface a pointless "Internal label" row above the real fields.
  const PAGE_TEXT_NO_TITLE_REQUIRED = new Set([
    'src/content/page-text/en/contact-details.mdx',
    'src/content/page-text/de/contact-details.mdx',
    'src/content/page-text/en/social.mdx',
    'src/content/page-text/de/social.mdx',
    'src/content/page-text/en/site/search.mdx',
    'src/content/page-text/de/site/search.mdx',
    'src/content/page-text/en/media/media-categories.mdx',
    'src/content/page-text/de/media/media-categories.mdx',
  ]);

  for (const file of files) {
    const label = rel(file);
    const frontmatter = parseFrontmatter(file);
    if (!frontmatter) continue;

    if (!PAGE_TEXT_NO_TITLE_REQUIRED.has(label)) {
      it(`${label} — must have a "title"`, () => {
        expectWithMessage(
          typeof frontmatter.title === 'string' && frontmatter.title.trim().length > 0,
          `File "${label}" is missing the required field "title".\n\n` +
          `Every page-text entry needs a title.\n\n` +
          `To fix: add a "title" field to the frontmatter:\n` +
          `  title: "My Section Title"`,
        );
      });
    }

    // buttonText ↔ buttonHref must come as a pair
    const hasButtonText = typeof frontmatter.buttonText === 'string';
    const hasButtonHref = typeof frontmatter.buttonHref === 'string';

    if (hasButtonText || hasButtonHref) {
      it(`${label} — "buttonText" and "buttonHref" must both be set together`, () => {
        expectWithMessage(
          hasButtonText && hasButtonHref,
          `File "${label}" has ${hasButtonText ? `"buttonText: ${frontmatter.buttonText}"` : 'no "buttonText"'}\n` +
          `and ${hasButtonHref ? `"buttonHref: ${frontmatter.buttonHref}"` : 'no "buttonHref"'}.\n\n` +
          `These two fields must always be provided together — a button needs\n` +
          `both a label (buttonText) and a destination (buttonHref).\n\n` +
          `To fix: either:\n` +
          `  1. Add the missing field:\n` +
          (!hasButtonText ? `     buttonText: "Click Me"\n` : '') +
          (!hasButtonHref ? `     buttonHref: "/some-page"\n` : '') +
          `  2. Or remove both fields if you don't want a button`,
        );
      });
    }

    // secondButtonText ↔ secondButtonHref must come as a pair
    const hasSecondText = typeof frontmatter.secondButtonText === 'string';
    const hasSecondHref = typeof frontmatter.secondButtonHref === 'string';

    if (hasSecondText || hasSecondHref) {
      it(`${label} — "secondButtonText" and "secondButtonHref" must both be set together`, () => {
        expectWithMessage(
          hasSecondText && hasSecondHref,
          `File "${label}" has ${hasSecondText ? `"secondButtonText: ${frontmatter.secondButtonText}"` : 'no "secondButtonText"'}\n` +
          `and ${hasSecondHref ? `"secondButtonHref: ${frontmatter.secondButtonHref}"` : 'no "secondButtonHref"'}.\n\n` +
          `These two fields must always be provided together.\n\n` +
          `To fix: either:\n` +
          `  1. Add the missing field:\n` +
          (!hasSecondText ? `     secondButtonText: "More Info"\n` : '') +
          (!hasSecondHref ? `     secondButtonHref: "/more"\n` : '') +
          `  2. Or remove both fields if you don't want a second button`,
        );
      });
    }

    // ctas max 4
    if (Array.isArray(frontmatter.ctas)) {
      it(`${label} — "ctas" must have at most 4 items`, () => {
        expectWithMessage(
          (frontmatter.ctas as unknown[]).length <= 4,
          `File "${label}" has ${(frontmatter.ctas as unknown[]).length} CTA items, but the maximum is 4.\n\n` +
          `The hero section can display at most 4 call-to-action cards.\n\n` +
          `To fix: remove extra CTA entries to bring the count to 4 or fewer.`,
        );
      });

      it(`${label} — each CTA must have "title", "description", and "href"`, () => {
        const invalidCtas = (frontmatter.ctas as Record<string, unknown>[]).filter(
          (cta) => {
            const missing: string[] = [];
            if (typeof cta.title !== 'string' || !cta.title.trim()) missing.push('title');
            if (typeof cta.description !== 'string' || !cta.description.trim()) missing.push('description');
            if (typeof cta.href !== 'string' || !cta.href.trim()) missing.push('href');
            return missing.length > 0;
          },
        );

        expectWithMessage(
          invalidCtas.length === 0,
          `File "${label}" has CTA items with missing fields.\n\n` +
          `Every CTA must have all three fields: "title", "description", and "href".\n\n` +
          `Example of a valid CTA:\n` +
          `  - title: "Our Projects"\n` +
          `    description: "See what we're working on"\n` +
          `    href: "/projects"`,
        );
      });
    }

    // socialLinks url validation
    if (Array.isArray(frontmatter.socialLinks)) {
      it(`${label} — all socialLinks must have valid URLs`, () => {
        const invalidLinks = (frontmatter.socialLinks as Record<string, unknown>[]).filter(
          (link) => {
            if (typeof link.url !== 'string') return true;
            try { new URL(link.url as string); return false; }
            catch { return true; }
          },
        );

        expectWithMessage(
          invalidLinks.length === 0,
          `File "${label}" has social links with invalid URLs:\n` +
          invalidLinks
            .map((link) => `  - platform: "${link.platform}", url: "${link.url}"`)
            .join('\n') +
          `\n\nURLs must start with "https://" or "http://".\n\n` +
          `To fix: update each URL to be a full, valid URL:\n` +
          `  - platform: "github"\n` +
          `    url: "https://github.com/bears-team"`,
        );
      });

    }
  }
});

// ---------------------------------------------------------------------------
// 3i. Docs frontmatter edge cases
//
//   - title is required
//   - order is required and must be a number
// ---------------------------------------------------------------------------

describe('Docs frontmatter edge cases', () => {
  const docsDir = join(CONTENT_DIR, 'docs');
  if (!existsSync(docsDir)) return;

  const files = collectFiles(docsDir).filter((f) =>
    VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()),
  );

  for (const file of files) {
    const label = rel(file);
    const frontmatter = parseFrontmatter(file);
    if (!frontmatter) continue;

    it(`${label} — must have a "title"`, () => {
      expectWithMessage(
        typeof frontmatter.title === 'string' && frontmatter.title.trim().length > 0,
        `File "${label}" is missing the required field "title".\n\n` +
        `Every documentation page needs a title shown in the sidebar and page heading.\n\n` +
        `To fix: add a "title" field to the frontmatter:\n` +
        `  title: "My Guide Title"`,
      );
    });

    it(`${label} — must have a numeric "order"`, () => {
      expectWithMessage(
        typeof frontmatter.order === 'number' && !isNaN(frontmatter.order as number),
        `File "${label}" has an invalid or missing "order" field: "${frontmatter.order}".\n\n` +
        `Every documentation page needs a numeric "order" to control its position\n` +
        `in the sidebar navigation. Lower numbers appear first.\n\n` +
        `To fix: add an "order" field with a number:\n` +
        `  order: 10\n\n` +
        `Tip: use increments of 10 (10, 20, 30...) so you can insert pages later.`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Referenced images exist on disk
// ---------------------------------------------------------------------------

describe('Image references point to existing files', () => {
  // ---- Events, Projects, People ----
  for (const [collection, fieldMap] of Object.entries(IMAGE_FIELD_TO_ASSET_DIR)) {
    if (collection === 'hero-slides') continue; // handled separately below

    const collectionDir = join(CONTENT_DIR, collection);
    if (!existsSync(collectionDir)) continue;

    const files = collectFiles(collectionDir).filter((f) =>
      VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()),
    );

    describe(`"${collection}" image references`, () => {
      for (const file of files) {
        const label = rel(file);
        const frontmatter = parseFrontmatter(file);
        if (!frontmatter) continue;

        for (const [field, assetDir] of Object.entries(fieldMap)) {
          const imageFilename = frontmatter[field] as string | undefined;
          if (!imageFilename) continue;

          it(`${label} — "${field}: ${imageFilename}" should exist in assets`, () => {
            const resolved = resolveAssetPath(assetDir, imageFilename);
            const matchFound = existsSync(resolved) && statSync(resolved).isFile();

            const topLevel = listAssetFiles(assetDir);
            const availableList = topLevel.length > 0
              ? `Top-level files in "${relative(ROOT, assetDir)}/":\n` + topLevel.map((f) => `  - ${f}`).join('\n')
              : `The directory "${relative(ROOT, assetDir)}/" has no top-level files.`;

            expectWithMessage(
              matchFound,
              `File "${label}" references image "${imageFilename}" in field "${field}",\n` +
              `but no file was found at "${relative(ROOT, resolved)}".\n\n` +
              availableList +
              `\n\nTo fix: add the image file so it resolves to "${relative(ROOT, resolved)}"`,
            );
          });
        }
      }
    });
  }

  // ---- Sponsors (tier-based asset dirs) ----
  const sponsorsDir = join(CONTENT_DIR, 'sponsors');
  if (existsSync(sponsorsDir)) {
    const files = collectFiles(sponsorsDir).filter((f) =>
      VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()),
    );

    describe('"sponsors" image references', () => {
      for (const file of files) {
        const label = rel(file);
        const frontmatter = parseFrontmatter(file);
        if (!frontmatter || !frontmatter.logo) continue;

        const logoFilename = frontmatter.logo as string;
        const assetDir = getSponsorAssetDir(file);

        it(`${label} — "logo: ${logoFilename}" should exist in assets`, () => {
          const resolved = resolveAssetPath(assetDir, logoFilename);
          const matchFound = existsSync(resolved) && statSync(resolved).isFile();

          const topLevel = listAssetFiles(assetDir);
          const availableList = topLevel.length > 0
            ? `Top-level files in "${relative(ROOT, assetDir)}/":\n` + topLevel.map((f) => `  - ${f}`).join('\n')
            : `The directory "${relative(ROOT, assetDir)}/" has no top-level files.`;

          expectWithMessage(
            matchFound,
            `File "${label}" references logo "${logoFilename}",\n` +
            `but no file was found at "${relative(ROOT, resolved)}".\n\n` +
            availableList +
            `\n\nTo fix: add the logo file so it resolves to "${relative(ROOT, resolved)}"`,
          );
        });
      }
    });
  }

  // ---- Hero slides (media field) ----
  const heroSlidesDir = join(CONTENT_DIR, 'hero-slides');
  if (existsSync(heroSlidesDir)) {
    const files = collectFiles(heroSlidesDir).filter((f) =>
      VALID_CONTENT_EXTENSIONS.has(extname(f).toLowerCase()),
    );

    const assetDir = join(ASSETS_DIR, 'hero', 'landingpage');

    describe('"hero-slides" media references', () => {
      for (const file of files) {
        const label = rel(file);
        const frontmatter = parseFrontmatter(file);
        const media = frontmatter?.media as { discriminant?: unknown; value?: unknown } | undefined;
        if (!media || typeof media.value !== 'string') continue;

        const mediaValue = media.value;

        it(`${label} — "media.value: ${mediaValue}" should exist in assets`, () => {
          const resolved = resolveAssetPath(assetDir, mediaValue);
          const matchFound = existsSync(resolved) && statSync(resolved).isFile();

          expectWithMessage(
            matchFound,
            `File "${label}" references media "${mediaValue}",\n` +
            `but no matching file was found under "${relative(ROOT, assetDir)}/".\n\n` +
            `Expected path: "${relative(ROOT, resolved)}"\n\n` +
            `To fix: upload the file through the admin UI (it will be placed at\n` +
            `src/assets/hero/landingpage/<slug>/media.<ext>) or move the existing\n` +
            `file into that subfolder and update "media.value" to match.`,
          );
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Sponsor files are in valid tier folders
// ---------------------------------------------------------------------------

describe('Sponsor tier structure', () => {
  const VALID_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
  const sponsorsDir = join(CONTENT_DIR, 'sponsors');

  if (existsSync(sponsorsDir)) {
    const entries = readdirSync(sponsorsDir, { withFileTypes: true });

    // Files directly in sponsors/ (not in a tier folder) are invalid
    const topLevelFiles = entries
      .filter((e) => e.isFile() && e.name !== 'config.ts')
      .map((e) => e.name);

    if (topLevelFiles.length > 0) {
      it('all sponsor files should be inside a tier folder', () => {
        expectWithMessage(
          false,
          `Found sponsor files directly in "src/content/sponsors/" instead of in a tier subfolder.\n\n` +
          `Misplaced files:\n` +
          topLevelFiles.map((f) => `  - ${f}`).join('\n') +
          `\n\nSponsor files must be inside one of these tier folders:\n` +
          VALID_TIERS.map((t) => `  - src/content/sponsors/${t}/`).join('\n') +
          `\n\nTo fix: move each sponsor file into the correct tier folder.`,
        );
      });
    }

    // Check for unexpected subdirectories
    const subdirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const invalidDirs = subdirs.filter((d) => !VALID_TIERS.includes(d));

    if (invalidDirs.length > 0) {
      it('sponsor tier folders should use valid tier names', () => {
        expectWithMessage(
          false,
          `Found unexpected folders in "src/content/sponsors/":\n` +
          invalidDirs.map((d) => `  - src/content/sponsors/${d}/`).join('\n') +
          `\n\nValid tier folders are:\n` +
          VALID_TIERS.map((t) => `  - src/content/sponsors/${t}/`).join('\n') +
          `\n\nTo fix: rename or remove the unexpected folders.`,
        );
      });
    }

    // If no issues, add a passing test
    if (topLevelFiles.length === 0 && invalidDirs.length === 0) {
      it('all sponsor files are in valid tier folders', () => {
        expect(true).toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 6. Locale parity: en/ and de/ files should match
// ---------------------------------------------------------------------------

describe('Locale parity (en/de)', () => {
  for (const collection of LOCALE_COLLECTIONS) {
    // page-text has many subfolders; check recursively
    const enDir = join(CONTENT_DIR, collection, 'en');
    const deDir = join(CONTENT_DIR, collection, 'de');

    if (!existsSync(enDir) || !existsSync(deDir)) continue;

    const enFiles = collectFiles(enDir).map((f) => relative(enDir, f));
    const deFiles = collectFiles(deDir).map((f) => relative(deDir, f));

    const enSet = new Set(enFiles);
    const deSet = new Set(deFiles);

    const missingInDe = enFiles.filter((f) => !deSet.has(f));
    const missingInEn = deFiles.filter((f) => !enSet.has(f));

    it(`"${collection}" — en/ and de/ should have matching files`, () => {
      const messages: string[] = [];

      if (missingInDe.length > 0) {
        messages.push(
          `Files in en/ but missing in de/ (no German translation):\n` +
          missingInDe.map((f) => `  - src/content/${collection}/de/${f}`).join('\n'),
        );
      }

      if (missingInEn.length > 0) {
        messages.push(
          `Files in de/ but missing in en/ (no English version):\n` +
          missingInEn.map((f) => `  - src/content/${collection}/en/${f}`).join('\n'),
        );
      }

      expectWithMessage(
        messages.length === 0,
        `Locale mismatch in "${collection}" collection.\n\n` +
        messages.join('\n\n') +
        `\n\nTo fix: add the missing translation files. ` +
        `You can copy an existing file from the other locale as a starting point.`,
      );
    });
  }
});
