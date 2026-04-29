/**
 * Schema Drift Tests
 *
 * The two schemas — Zod (Astro, build-time) and Keystatic (admin UI) — are
 * independent. The sibling suites catch existing-content drift:
 *
 *   - contentValidation.test.ts checks every file against Zod.
 *   - keystaticSchema.test.ts round-trips every file through Keystatic's
 *     Reader API and asserts the Astro→Keystatic collection mapping.
 *
 * What's left uncovered is *structural* drift — a Keystatic-only enum value
 * or field that no existing entry happens to use yet, and which would only
 * surface the next time an editor picks it. This file closes that gap by
 * comparing the two schemas directly.
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'astro:content';
import keystaticConfig from '../../../keystatic.config';
import { collections as astroCollections } from '../../content/config';
import { CategoryEventEnum, CategoryProjectEnum } from '../../types/content';

const ROOT = join(__dirname, '..', '..', '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walks past .refine() / .transform() (ZodEffects) and .optional() / .default()
 * (ZodOptional / ZodDefault) wrappers to the underlying ZodObject. Returns
 * null if the schema doesn't ultimately resolve to an object.
 *
 * The walk reads `_def`, which is a Zod-internal field. If a Zod major bump
 * reshapes it, this helper breaks loudly — which is the failure mode we want
 * (noisy test) over silent drift.
 */
type ZodInternalDef = {
  typeName?: string;
  schema?: z.ZodTypeAny;
  innerType?: z.ZodTypeAny;
};

function unwrapToObject(schema: z.ZodTypeAny): z.ZodObject<z.ZodRawShape> | null {
  let s: z.ZodTypeAny | undefined = schema;
  for (let i = 0; i < 20 && s; i++) {
    const def: ZodInternalDef | undefined = (s as { _def?: ZodInternalDef })._def;
    if (!def) return null;
    if (def.typeName === 'ZodObject') return s as z.ZodObject<z.ZodRawShape>;
    if (def.schema) { s = def.schema; continue; }
    if (def.innerType) { s = def.innerType; continue; }
    return null;
  }
  return null;
}

function zodTopLevelFields(schema: z.ZodTypeAny): Set<string> {
  const obj = unwrapToObject(schema);
  return new Set(obj ? Object.keys(obj.shape) : []);
}

function keystaticTopLevelFields(schema: Record<string, unknown>): Set<string> {
  return new Set(Object.keys(schema));
}

// Fields that legitimately exist on only one side and should be ignored when
// diffing. Keep these tight — every entry is a hidden divergence.
const ASTRO_ONLY_FIELDS = new Set<string>([
  // Derived by .transform() in src/content/config.ts and not stored on disk.
  'coverImageType',
]);

const KEYSTATIC_ONLY_FIELDS = new Set<string>([
  // MDX body content — Keystatic's `format: { contentField: 'body' }` writes
  // it after the YAML frontmatter, so it never appears in the Zod schema.
  'body',
]);

// ---------------------------------------------------------------------------
// 1. Select-option parity
// ---------------------------------------------------------------------------

describe('Select-option parity (keystatic.config.ts ↔ src/content/config.ts)', () => {
  it('Event categories match between Keystatic and Zod', () => {
    // Re-derive Keystatic's option set from the *parsed* schema rather than
    // re-importing the EVENT_CATEGORIES constant — guarantees we're testing
    // what the admin UI actually shows.
    const eventsCollection = (keystaticConfig.collections as Record<string, { schema: Record<string, unknown> }>).eventsEn;
    const categoryField = eventsCollection.schema.categoryEvent as { options: ReadonlyArray<{ value: string }> };
    const ksValues = new Set(categoryField.options.map((o) => o.value));
    const zodValues = new Set(CategoryEventEnum.options);

    expect(
      [...ksValues].sort(),
      'Keystatic EVENT_CATEGORIES and CategoryEventEnum.options diverged. ' +
      'Update both src/types/content.ts AND keystatic.config.ts together.',
    ).toEqual([...zodValues].sort());
  });

  it('Project categories match between Keystatic and Zod', () => {
    const projectsCollection = (keystaticConfig.collections as Record<string, { schema: Record<string, unknown> }>).projectsEn;
    const categoryField = projectsCollection.schema.categoryProject as { options: ReadonlyArray<{ value: string }> };
    const ksValues = new Set(categoryField.options.map((o) => o.value));
    const zodValues = new Set(CategoryProjectEnum.options);

    expect(
      [...ksValues].sort(),
      'Keystatic PROJECT_CATEGORIES and CategoryProjectEnum.options diverged. ' +
      'Update both src/types/content.ts AND keystatic.config.ts together.',
    ).toEqual([...zodValues].sort());
  });

  it('Media category IDs in Keystatic are all handled by the dispatch + page', () => {
    // No Zod enum here — media categories live as a free-form string in the
    // page-text `mediaCategories` array. The actual consumers are:
    //   - getMediaItemsByCategory's switch in src/utils/contentQueries.ts
    //     (handles 'events', 'projects', 'hero', 'what-is-bears',
    //     'about-us')
    //   - the runtime 'all' aggregate, assembled in media.astro
    // A Keystatic option that no consumer handles silently shows nothing,
    // which is the regression we want to catch.

    const mediaCategoriesField = (keystaticConfig.singletons as Record<string, { schema: Record<string, unknown> }>)
      .pageTextMediaCategoriesEn.schema.mediaCategories as { arrayFieldConfig?: unknown };
    // Drill down to the inner select field's options.
    // Keystatic's fields.array stores its element under `.element` and the
    // object's inner fields under `.fields`. Defensive lookups so a future
    // Keystatic refactor surfaces as a clear test failure.
    const arrayElement = (mediaCategoriesField as { element?: { fields?: { id?: { options?: ReadonlyArray<{ value: string }> } } } }).element;
    const idOptions = arrayElement?.fields?.id?.options;
    expect(idOptions, 'Could not find media category id select options inside the Keystatic singleton — has the Keystatic schema shape changed?').toBeDefined();
    const ksValues = new Set((idOptions ?? []).map((o) => o.value));

    const mediaSource = readFileSync(join(ROOT, 'src/pages/media.astro'), 'utf8');
    const queriesSource = readFileSync(join(ROOT, 'src/utils/contentQueries.ts'), 'utf8');

    expect(
      mediaSource.includes('getMediaItemsByCategory'),
      'media.astro must call getMediaItemsByCategory(...) to populate non-"all" categories.',
    ).toBe(true);

    // Parse the case statements out of getMediaItemsByCategory to find which
    // category ids the dispatch handles. Looks for `case 'X':` patterns inside
    // the switch — defensive enough to catch silent dispatch drift.
    const dispatchSection = queriesSource.match(/getMediaItemsByCategory[\s\S]*?switch\s*\([^)]+\)\s*\{([\s\S]*?)\n\}/);
    expect(dispatchSection, 'Could not find getMediaItemsByCategory switch in contentQueries.ts').toBeTruthy();
    const dispatchCases = new Set(
      [...(dispatchSection![1].matchAll(/case\s+['"]([\w-]+)['"]\s*:/g))].map((m) => m[1]),
    );

    // 'all' is built at runtime in media.astro. Everything else must be in
    // the dispatch.
    const SPECIAL_CASED = new Set(['all']);
    const ksRequiringDispatch = [...ksValues].filter((v) => !SPECIAL_CASED.has(v));

    const onlyInKeystatic = ksRequiringDispatch.filter((v) => !dispatchCases.has(v));
    const onlyInDispatch = [...dispatchCases].filter((v) => !ksValues.has(v));

    expect(
      { onlyInKeystatic, onlyInDispatch },
      'Media category drift: every Keystatic option (excluding "all") must have a matching `case` in getMediaItemsByCategory, and every case must correspond to a Keystatic option.',
    ).toEqual({ onlyInKeystatic: [], onlyInDispatch: [] });
  });
});

// ---------------------------------------------------------------------------
// 2. Field-name parity per collection
//
// For each scalar Astro collection, assert that the top-level field names in
// the Zod schema match the top-level field names in the corresponding
// Keystatic collection. Going recursive (per-field type parity) would
// re-implement a Zod-to-Keystatic compiler and is out of scope.
// `page-text` is excluded because Keystatic explodes it into per-shape
// singletons — handled separately in section 3.
// ---------------------------------------------------------------------------

// Map from Astro collection name -> any one Keystatic collection key that
// writes into src/content/<name>/. For families split per-locale (events,
// projects, sponsors, docs), all variants share the same factory and so the
// same field set, so we only need to check one.
const KEYSTATIC_REPRESENTATIVE: Record<string, string> = {
  sponsors: 'sponsorsDiamond',
  events: 'eventsEn',
  projects: 'projectsEn',
  'hero-slides': 'heroSlides',
  instagram: 'instagram',
  people: 'people',
  docs: 'docsGuides',
  'social-platforms': 'socialPlatforms',
};

describe('Field-name parity per collection', () => {
  for (const [astroName, ksKey] of Object.entries(KEYSTATIC_REPRESENTATIVE)) {
    it(`"${astroName}" — top-level fields match`, () => {
      const astroCollection = astroCollections[astroName as keyof typeof astroCollections];
      const zodFields = zodTopLevelFields(astroCollection.schema as z.ZodTypeAny);

      const ksCollection = (keystaticConfig.collections as Record<string, { schema: Record<string, unknown> }>)[ksKey];
      expect(ksCollection, `Keystatic collection "${ksKey}" not found.`).toBeDefined();
      const ksFields = keystaticTopLevelFields(ksCollection.schema);

      const onlyInZod = [...zodFields]
        .filter((f) => !ksFields.has(f) && !ASTRO_ONLY_FIELDS.has(f))
        .sort();
      const onlyInKeystatic = [...ksFields]
        .filter((f) => !zodFields.has(f) && !KEYSTATIC_ONLY_FIELDS.has(f))
        .sort();

      expect(
        { onlyInZod, onlyInKeystatic },
        `Schema drift in "${astroName}":\n` +
          `  - Fields in Zod but missing from Keystatic: ${JSON.stringify(onlyInZod)}\n` +
          `  - Fields in Keystatic but missing from Zod: ${JSON.stringify(onlyInKeystatic)}\n` +
          `If a field is intentionally one-sided, add it to ASTRO_ONLY_FIELDS or KEYSTATIC_ONLY_FIELDS in this test.`,
      ).toEqual({ onlyInZod: [], onlyInKeystatic: [] });
    });
  }
});

// ---------------------------------------------------------------------------
// 3. page-text singletons stay within the union schema
//
// The Astro `page-text` Zod schema is the *union* of fields used across all
// shapes. Each Keystatic singleton picks a subset. Drift surfaces as a
// Keystatic singleton field that has no home in the Zod union — typically
// from a new shape helper added in keystatic.config.ts without the matching
// pageTextSchema field.
// ---------------------------------------------------------------------------

describe('page-text singletons stay within the Zod union schema', () => {
  const pageTextZodFields = zodTopLevelFields(astroCollections['page-text'].schema as z.ZodTypeAny);
  const allSingletons = (keystaticConfig.singletons ?? {}) as Record<string, { path: string; schema: Record<string, unknown> }>;
  const pageTextSingletons = Object.entries(allSingletons).filter(([, s]) =>
    s.path.startsWith('src/content/page-text/'),
  );

  it('found page-text singletons to check', () => {
    expect(pageTextSingletons.length).toBeGreaterThan(0);
  });

  for (const [name, singleton] of pageTextSingletons) {
    it(`"${name}" — every field is covered by pageTextSchema`, () => {
      const ksFields = keystaticTopLevelFields(singleton.schema);
      const stray = [...ksFields]
        .filter((f) => !pageTextZodFields.has(f) && !KEYSTATIC_ONLY_FIELDS.has(f))
        .sort();
      expect(
        stray,
        `Singleton "${name}" exposes fields not present in pageTextSchema: ${JSON.stringify(stray)}. ` +
          `Either add the field to the page-text Zod schema in src/content/config.ts, or remove it from keystatic.config.ts.`,
      ).toEqual([]);
    });
  }
});
