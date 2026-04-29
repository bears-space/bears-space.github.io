import { config, collection, fields, singleton } from '@keystatic/core';
import { buildMdxComponents } from './src/keystatic/mdxComponents';

// ============================================================================
// STORAGE — local filesystem in dev, GitHub in production admin
//
// `local` writes edits straight to src/content/ on disk — no OAuth roundtrip,
// no wait for GitHub's build pipeline, so `npm run dev:admin` reflects changes
// immediately. `github` is used by the deployed admin site (built with
// ADMIN_BUILD=true which sets NODE_ENV to production), where editor saves need
// to commit back to the repo.
//
// `KEYSTATIC_STORAGE=github` in .env forces github storage in dev too — needed
// to render `/keystatic/setup` (the GitHub App registration wizard), which is
// otherwise skipped because local storage has no OAuth to configure.
// ============================================================================

const useGithubStorage =
  process.env.NODE_ENV === 'production' ||
  import.meta.env.KEYSTATIC_STORAGE === 'github';

const storage = useGithubStorage
  ? {
      kind: 'github' as const,
      repo: {
        owner: 'bears-space',
        name: 'bears-space.github.io',
      },
    }
  : { kind: 'local' as const };

// ============================================================================
// FIELD HELPERS — shared between collections
// ============================================================================

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'svg'];

// Keystatic loads the whole file into memory as a Uint8Array and base64-encodes
// it on save — large uploads freeze the admin tab for many seconds. The library
// exposes no maxSize / resize option in v0.5, so we warn editors in the field
// description to pre-resize instead.
const IMAGE_SIZE_HINT =
  'Larger images (>2 MB) will freeze the tab during upload — just let it run and it will go through after a while. Smaller images are preferred (try squoosh.app to shrink first).';

// Keystatic scopes uploads inside `directory` with a per-entry subfolder
// (e.g. src/assets/events/test/coverImage.jpg for event "test"). We intentionally
// pass an empty publicPath so the frontmatter stores a path relative to the
// collection's asset base dir — e.g. `test/coverImage.jpg`. The image loaders
// in src/utils/imageLoader.ts already prepend the baseDir, so this matches both
// the legacy flat-filename entries (coverImage: "event-8.jpg") and the new
// slug-subfolder entries from Keystatic. Globs in src/utils/imageGlobs.ts must
// use `**/*.*` so subfolder files are picked up.
function imageField(
  label: string,
  directory: string,
  _publicPath: string,
  opts: { required?: boolean } = {},
) {
  const { required = true } = opts;
  return fields.image({
    label,
    directory,
    publicPath: '',
    description: IMAGE_SIZE_HINT,
    validation: { isRequired: required },
  });
}

// Variant of imageField for assets that live in /public (served at the site
// root, not imported via Astro's asset pipeline). `publicPath: '/'` makes
// Keystatic store the value as `/<filename>` — a URL the admin UI can preview
// directly and that consumers can drop straight into an href/src attribute.
function publicAssetField(label: string) {
  return fields.image({
    label,
    directory: 'public',
    publicPath: '/',
    description: IMAGE_SIZE_HINT,
    validation: { isRequired: true },
  });
}

// Variant of imageField for singleton fields that point at a specific
// directory under `src/assets/`. Unlike `imageField` (which stores a bare
// filename for per-entry subfolder uploads), this one stores the full
// `/src/assets/<dir>/<file>` URL so the admin preview resolves against Astro's
// Vite dev server. `resolveImagePath` in imageLoader.ts short-circuits on
// any value starting with `/src/`, so consumers don't need special handling.
function brandingAssetField(label: string, directory: string) {
  return fields.image({
    label,
    directory,
    publicPath: `/${directory}/`,
    description: IMAGE_SIZE_HINT,
    validation: { isRequired: true },
  });
}

// Keystatic's `contentField` must reference a real content field (mdx /
// markdoc / document), not a plain text field. All content is stored as
// `.mdx` so the collections share a single body helper.
//
// `components` must bind `fields.image` to a specific collection asset root,
// so body fields are built per-collection. Callers without an imageRoot get
// the legacy text-input Img block.
const mdxBody = (imageRoot?: string, opts: { includePreview?: boolean } = {}) =>
  fields.mdx({
    label: 'Body',
    extension: 'mdx',
    components: buildMdxComponents({ imageRoot, includePreview: opts.includePreview }),
  });

const EVENT_CATEGORIES = [
  { label: 'Trade Fairs & Conventions', value: 'trade-fairs-and-conventions' },
  { label: 'Competitions & Workshops', value: 'competitions-and-workshops' },
  { label: 'Kick-off Events', value: 'kick-off-events' },
  { label: 'Other', value: 'other' },
] as const;

const PROJECT_CATEGORIES = [
  { label: 'Experimental Rocketry', value: 'experimental-rocketry' },
  { label: 'Science & Experiments', value: 'science-and-experiments' },
  { label: 'Robotics', value: 'robotics' },
  { label: 'Other', value: 'other' },
] as const;

// Source of truth for Media-page category IDs. Used by the page-text
// `mediaCategories` select AND by the dispatch in
// src/utils/contentQueries.ts → getMediaItemsByCategory(). Each category
// pulls from a different source:
//   - 'about-us'      → about-us page hero + about-us "Our Mission" section
//                       image + the Faces of BEARS roster (People collection
//                       filtered by `showInFaces` + having a `coverImage`)
//   - 'events'        → event covers + inline <Img> images from event bodies
//   - 'projects'      → project covers + inline <Img> images from project bodies
//   - 'hero'          → landing-page hero-slides (image branch only) + the
//                       events/projects/sponsors/contact/media title heroes
//   - 'what-is-bears' → landing/what-is-bears singleton's carouselImages
//   - 'all'           → runtime aggregate of every category above
// Adding a new value here also requires updating the dispatch.
const MEDIA_CATEGORY_IDS = [
  { label: 'About Us', value: 'about-us' },
  { label: 'Events', value: 'events' },
  { label: 'Hero Images', value: 'hero' },
  { label: 'Projects', value: 'projects' },
  { label: 'What is BEARS', value: 'what-is-bears' },
  { label: 'All (aggregates every category above)', value: 'all' },
] as const;

// ============================================================================
// COLLECTION FACTORIES — one factory per collection family,
// invoked once per locale / tier as needed.
// ============================================================================

function sponsorsCollection(tier: 'diamond' | 'platinum' | 'gold' | 'silver' | 'bronze') {
  const tierLabel = tier[0].toUpperCase() + tier.slice(1);
  return collection({
    label: `Sponsors – ${tierLabel}`,
    slugField: 'name',
    path: `src/content/sponsors/${tier}/*`,
    columns: ['order', 'url'],
    format: { contentField: 'body' },
    entryLayout: 'form',
    schema: {
      name: fields.slug({
        name: { label: 'Sponsor name', validation: { isRequired: true } },
        slug: {
          label: 'Filename',
          description:
            "Auto-generated from the sponsor name — you don't need to touch this. Changing it renames the content file on disk.",
        },
      }),
      order: fields.integer({
        label: 'Order',
        description: 'Sort order within this tier (lower = shown first). Ties fall back to the sponsor name. Note: the landing page\'s "Become a Sponsor" section only shows the top 3 non-empty tiers (diamond → bronze priority) — sponsors in lower tiers still appear on the dedicated Sponsors page.',
        defaultValue: 0,
        validation: { isRequired: true },
      }),
      logo: imageField('Logo', `src/assets/sponsors/${tier}`, `/src/assets/sponsors/${tier}/`),
      alt: fields.text({
        label: 'Logo alt text (optional)',
        description: 'Read by screen readers. Defaults to the sponsor name if left blank.',
      }),
      url: fields.url({ label: 'Website URL' }),
      bgColor: fields.text({
        label: 'Background color (hex)',
        description: 'Applied behind the logo. Default #ffffff.',
        defaultValue: '#ffffff',
      }),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function eventsCollection(locale: 'en' | 'de') {
  return collection({
    label: `Events (${locale.toUpperCase()})`,
    slugField: 'title',
    path: `src/content/events/${locale}/*`,
    columns: ['date', 'categoryEvent', 'isDraft'],
    format: { contentField: 'body' },
    entryLayout: 'content',
    schema: {
      title: fields.slug({
        name: { label: 'Title', validation: { isRequired: true } },
        slug: {
          label: 'URL slug',
          description:
            "Auto-generated from the title — you don't need to touch this. Do not change after publishing: this appears in the event's public URL (/events/…). Renaming breaks inbound links, SEO, and shared bookmarks.",
          validation: {
            length: { min: 3, max: 80 },
            pattern: {
              regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
              message: 'Lowercase letters, digits, and single hyphens only.',
            },
          },
        },
      }),
      description: fields.text({
        label: 'Short description',
        multiline: true,
        validation: { isRequired: true },
      }),
      date: fields.date({ label: 'Date', validation: { isRequired: true } }),
      categoryEvent: fields.select({
        label: 'Category',
        options: EVENT_CATEGORIES,
        defaultValue: 'other',
      }),
      coverImage: imageField('Cover image', 'src/assets/events', '/src/assets/events/'),
      coverImageDescription: fields.text({
        label: 'Cover image description / credit (optional)',
        description: 'Shown as a caption strip at the bottom of the cover image on the Media page. Use it for any combination of caption and photographer credit (e.g. "Group photo after the launch — © 2025 Jane Doe"). Leave blank for no caption.',
      }),
      isDraft: fields.checkbox({
        label: 'Draft',
        description: 'Drafts are hidden in production but visible in dev.',
        defaultValue: false,
      }),
      body: mdxBody('src/assets/events'),
    },
  });
}

function projectsCollection(locale: 'en' | 'de') {
  return collection({
    label: `Projects (${locale.toUpperCase()})`,
    slugField: 'title',
    path: `src/content/projects/${locale}/*`,
    columns: ['date', 'categoryProject', 'isDraft', 'isProjectCompleted', 'displayMeetTheTeam'],
    format: { contentField: 'body' },
    entryLayout: 'content',
    schema: {
      title: fields.slug({
        name: { label: 'Title', validation: { isRequired: true } },
        slug: {
          label: 'URL slug',
          description:
            "Auto-generated from the title — you don't need to touch this. Do not change after publishing: this appears in the project's public URL (/projects/…). Renaming breaks inbound links, SEO, and shared bookmarks.",
          validation: {
            length: { min: 3, max: 80 },
            pattern: {
              regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
              message: 'Lowercase letters, digits, and single hyphens only.',
            },
          },
        },
      }),
      description: fields.text({
        label: 'Short description',
        multiline: true,
        validation: { isRequired: true },
      }),
      date: fields.date({ label: 'Date', validation: { isRequired: true } }),
      categoryProject: fields.select({
        label: 'Category',
        options: PROJECT_CATEGORIES,
        defaultValue: 'other',
      }),
      coverImage: imageField('Cover image', 'src/assets/projects', '/src/assets/projects/'),
      coverImageDescription: fields.text({
        label: 'Cover image description / credit (optional)',
        description: 'Shown as a caption strip at the bottom of the cover image on the Media page. Use it for any combination of caption and photographer credit. Leave blank for no caption.',
      }),
      isDraft: fields.checkbox({
        label: 'Draft',
        description: 'Drafts are hidden in production but visible in dev.',
        defaultValue: false,
      }),
      isProjectCompleted: fields.checkbox({
        label: 'Project completed',
        description: 'Marks the project as completed (vs ongoing).',
        defaultValue: false,
      }),
      // Meet the Team is wired through the unified `people` collection: editors
      // pick a person from the dropdown rather than typing a name + uploading a
      // duplicate photo. The Astro Zod schema's .refine() enforces "person is
      // required when displayMeetTheTeam is true" at build time — Keystatic
      // can't express that cross-field requirement natively.
      displayMeetTheTeam: fields.checkbox({
        label: 'Show this project in the "Meet the Team" section',
        defaultValue: false,
      }),
      person: fields.relationship({
        label: 'Head of project',
        description: 'Pick from the People collection. Required when "Show in Meet the Team" is on. If the person does not exist yet, create them in the People group first.',
        collection: 'people',
      }),
      body: mdxBody('src/assets/projects'),
    },
  });
}

// Page-text content is fully split into per-file Keystatic singletons so each
// editor form shows only the fields the file actually uses. The Astro Zod
// schema in src/content/config.ts stays permissive (all fields optional)
// since entries from every shape live in one `page-text` collection.
//
// Layout on disk:
//   src/content/page-text/<locale>/<section>/<entry>.mdx — per-file singleton
//   src/content/page-text/<locale>/hero.mdx              — singleton
//   src/content/page-text/<locale>/faq.mdx               — singleton
//   ...etc. Each singleton picks one of the shape helpers below for its schema.

function pageTextCtasField() {
  return fields.array(
    fields.object({
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      description: fields.text({ label: 'Description', validation: { isRequired: true } }),
      href: fields.text({ label: 'Link', validation: { isRequired: true } }),
    }),
    {
      label: 'Call to Action buttons',
      description: 'Up to 4 CTA buttons shown below the hero headline. Drag the handle on the left of each item to reorder them.',
      itemLabel: (p) => p.fields.title.value || 'Untitled',
      validation: { length: { max: 4 } },
    },
  );
}

function pageTextItemsField() {
  return fields.array(fields.text({ label: 'Item' }), {
    label: 'Items',
    description: 'Drag the handle on the left of each item to reorder them.',
    itemLabel: (p) => p.value || 'Empty',
  });
}

function pageTextTitledItemsField() {
  return fields.array(
    fields.object({
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      description: fields.text({ label: 'Description', multiline: true }),
    }),
    {
      label: 'Items',
      description: 'Each item has a bold title and an optional description. Drag the handle on the left of each item to reorder them.',
      itemLabel: (p) => p.fields.title.value || 'Untitled',
    },
  );
}

function pageTextFaqsField() {
  return fields.array(
    fields.object({
      question: fields.text({ label: 'Question', validation: { isRequired: true } }),
      answer: fields.text({ label: 'Answer', multiline: true, validation: { isRequired: true } }),
    }),
    {
      label: 'FAQs',
      description: 'Drag the handle on the left of each item to reorder them.',
      itemLabel: (p) => p.fields.question.value || 'Untitled',
    },
  );
}

function pageTextSocialLinksField() {
  return fields.array(
    fields.object({
      platform: fields.relationship({
        label: 'Platform',
        description: 'Pick from the Social platforms collection. To add a new platform, create an entry there first (icon + default hover color) — it will immediately appear in this dropdown.',
        collection: 'socialPlatforms',
        validation: { isRequired: true },
      }),
      url: fields.url({ label: 'URL', validation: { isRequired: true } }),
      hoverColor: fields.text({
        label: 'Hover color (hex, optional)',
        description: 'Override this platform\'s default hover color. Leave blank to use the default (site accent, or the platform\'s brand color where one is defined).',
      }),
    }),
    {
      label: 'Social links',
      description: 'Drag the handle on the left of each item to reorder them.',
      itemLabel: (p) => p.fields.platform.value || 'Untitled',
    },
  );
}

function pageTextNavLinksField() {
  return fields.array(
    fields.object({
      label: fields.text({ label: 'Label', validation: { isRequired: true } }),
      href: fields.text({ label: 'Link', validation: { isRequired: true } }),
    }),
    {
      label: 'Nav links',
      description: 'Drag the handle on the left of each item to reorder them.',
      itemLabel: (p) => p.fields.label.value || 'Untitled',
    },
  );
}

function pageTextNavColumnsField() {
  return fields.array(
    fields.object({
      heading: fields.text({ label: 'Heading', validation: { isRequired: true } }),
      href: fields.text({ label: 'Heading link', validation: { isRequired: true } }),
      links: fields.array(
        fields.object({
          label: fields.text({ label: 'Label', validation: { isRequired: true } }),
          href: fields.text({ label: 'Link', validation: { isRequired: true } }),
        }),
        {
          label: 'Sub-headings',
          description: 'Drag the handle on the left of each item to reorder them.',
          itemLabel: (p) => p.fields.label.value || 'Untitled',
        },
      ),
    }),
    {
      label: 'Navigation columns',
      description: 'Drag the handle on the left of each column to reorder them.',
      itemLabel: (p) => p.fields.heading.value || 'Untitled',
    },
  );
}

function pageTextMediaCategoriesField() {
  return fields.array(
    fields.object({
      id: fields.select({
        label: 'Category',
        description: 'Which image set this entry pulls from. The list is fixed — adding a new option requires a code change in src/pages/media.astro.',
        options: MEDIA_CATEGORY_IDS,
        defaultValue: 'about-us',
      }),
      label: fields.text({
        label: 'Label',
        description: 'Heading shown above this category on the Media page (locale-specific).',
        validation: { isRequired: true },
      }),
    }),
    {
      label: 'Media categories',
      description: 'Drag the handle on the left of each item to reorder them.',
      itemLabel: (p) => p.fields.label.value || 'Untitled',
    },
  );
}

// ---- Per-file singleton shape helpers ------------------------------------
//
// Each section file in src/content/page-text/<locale>/<section>/ gets its own
// Keystatic singleton, scoped to one of these shapes. Editors only see the
// fields the file actually uses.

type Locale = 'en' | 'de';

function baseSingletonMeta(locale: Locale, pathSuffix: string, label: string) {
  return {
    label: `${label} (${locale.toUpperCase()})`,
    path: `src/content/page-text/${locale}/${pathSuffix}`,
    format: { contentField: 'body' as const },
    entryLayout: 'form' as const,
  };
}

function pageHeaderSingleton(
  locale: Locale,
  pathSuffix: string,
  label: string,
  imageDirectory: string,
) {
  const isEn = locale === 'en';
  return singleton({
    ...baseSingletonMeta(locale, pathSuffix, `${label} + SEO`),
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      subtitle: fields.text({
        label: 'Subtitle',
        description: isEn
          ? undefined
          : 'Note: the background image for this page is managed on the English (EN) singleton and shared across both locales.',
      }),
      seoDescription: fields.text({
        label: 'SEO description',
        description: 'Shown as the <meta name="description"> for this page (~150 characters).',
        multiline: true,
      }),
      ...(isEn ? {
        image: fields.image({
          label: 'Background image',
          directory: imageDirectory,
          publicPath: `/${imageDirectory}/`,
          description: IMAGE_SIZE_HINT,
        }),
        imageAlt: fields.text({
          label: 'Background image alt text',
          description: 'Read by screen readers. Describe what the image shows.',
          validation: { isRequired: true },
        }),
      } : {}),
      shownText: fields.text({
        label: 'Overlay text / Media-page caption (optional)',
        description: 'Small text shown in the top-right corner of the hero image on this page. The same text doubles as the caption strip when this hero appears on /media (use it for any combination of caption and photographer credit).',
      }),
      ...(isEn ? {
        imageDisplayInMedia: fields.checkbox({
          label: 'Show this hero image on the Media page',
          description: 'Appears in the Hero Images (or About Us) accordion.',
          defaultValue: true,
        }),
      } : {}),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function sectionSingleton(locale: Locale, pathSuffix: string, label: string) {
  return singleton({
    ...baseSingletonMeta(locale, pathSuffix, label),
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      subtitle: fields.text({ label: 'Subtitle' }),
      description: fields.text({ label: 'Description', multiline: true }),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

// Variant of sectionSingleton that also exposes a single image drop-in.
// The image is locale-agnostic — it's only editable on the EN singleton and
// the component reads it from there regardless of the active locale. DE hides
// the field and shows a note pointing editors to EN. Used by About us "Our
// Mission".
function sectionWithImageSingleton(locale: Locale, pathSuffix: string, label: string, imageDirectory: string) {
  const isEn = locale === 'en';
  return singleton({
    ...baseSingletonMeta(locale, pathSuffix, label),
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      subtitle: fields.text({
        label: 'Subtitle',
        description: isEn
          ? undefined
          : 'Note: the image for this section is managed on the English (EN) singleton and shared across both locales.',
      }),
      description: fields.text({ label: 'Description', multiline: true }),
      ...(isEn ? {
        image: fields.image({
          label: 'Image',
          directory: imageDirectory,
          publicPath: `/${imageDirectory}/`,
          description: IMAGE_SIZE_HINT,
        }),
        imageAlt: fields.text({
          label: 'Image alt text',
          description: 'Read by screen readers. Describe what the image shows.',
        }),
        imageDescription: fields.text({
          label: 'Image description / credit (optional)',
          description: 'Captured for editorial use. Surfaces as a caption strip wherever this image is rendered through the shared <Img> component. Use it for any combination of caption and photographer credit.',
        }),
        imageDisplayInMedia: fields.checkbox({
          label: 'Show this section image on the Media page',
          description: 'Appears in the Media page accordion.',
          defaultValue: true,
        }),
      } : {}),
      buttonText: fields.text({ label: 'Button text' }),
      buttonHref: fields.text({ label: 'Button link' }),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function sectionWithButtonSingleton(locale: Locale, pathSuffix: string, label: string) {
  return singleton({
    ...baseSingletonMeta(locale, pathSuffix, label),
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      subtitle: fields.text({ label: 'Subtitle' }),
      description: fields.text({ label: 'Description', multiline: true }),
      buttonText: fields.text({ label: 'Button text' }),
      buttonHref: fields.text({ label: 'Button link' }),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

// Variant of sectionWithButtonSingleton that also exposes a reorderable list of
// carousel images. Only used by landing/what-is-bears — images are locale-agnostic
// so we attach the array to the EN singleton and the component reads it regardless
// of the active locale.
function sectionWithButtonAndImagesSingleton(locale: Locale, pathSuffix: string, label: string) {
  return singleton({
    ...baseSingletonMeta(locale, pathSuffix, label),
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      subtitle: fields.text({ label: 'Subtitle' }),
      description: fields.text({ label: 'Description', multiline: true }),
      buttonText: fields.text({ label: 'Button text' }),
      buttonHref: fields.text({ label: 'Button link' }),
      carouselImages: fields.array(
        fields.object({
          src: fields.image({
            label: 'Image',
            directory: 'src/assets/whatIsBears',
            publicPath: '/src/assets/whatIsBears/',
            description: IMAGE_SIZE_HINT,
            validation: { isRequired: true },
          }),
          alt: fields.text({
            label: 'Alt text',
            description: 'Describe what the image shows. Read by screen readers.',
            validation: { isRequired: true, length: { min: 1 } },
          }),
          description: fields.text({
            label: 'Description / credit (optional)',
            description: 'Shown as a caption strip when this image appears on the Media page. Use it for any combination of caption and photographer credit. No effect on the marquee.',
          }),
          displayInMedia: fields.checkbox({
            label: 'Show on the Media page',
            description: 'Appears in the "What is BEARS" category on the Media page.',
            defaultValue: true,
          }),
        }),
        {
          label: 'Carousel images',
          description: 'Images shown in the marquee below the text. Drag the handle to reorder. Managed on the English page only — they display on both locales.',
          itemLabel: (p) => p.fields.alt.value || 'Image',
        },
      ),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function crosslinkSingleton(locale: Locale, pathSuffix: string, label: string) {
  return singleton({
    ...baseSingletonMeta(locale, pathSuffix, label),
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      buttonText: fields.text({ label: 'Button text', validation: { isRequired: true } }),
      buttonHref: fields.text({ label: 'Button link', validation: { isRequired: true } }),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function titledListSectionSingleton(locale: Locale, pathSuffix: string, label: string) {
  return singleton({
    ...baseSingletonMeta(locale, pathSuffix, label),
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      subtitle: fields.text({ label: 'Subtitle' }),
      description: fields.text({ label: 'Description', multiline: true }),
      titledItems: pageTextTitledItemsField(),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function findUsSingleton(locale: Locale, pathSuffix: string, label: string) {
  return singleton({
    ...baseSingletonMeta(locale, pathSuffix, label),
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      subtitle: fields.text({ label: 'Subtitle' }),
      description: fields.text({ label: 'Description', multiline: true }),
      room: fields.text({
        label: 'Room label',
        description: 'Large text next to the map — the room/building where you meet.',
      }),
      schedule: fields.text({
        label: 'Meeting time',
        description: 'Rendered below the room label — when the meetings happen.',
      }),
      mapLat: fields.number({
        label: 'Map pin latitude',
        description:
          'Latitude of the pin shown on the "Where to find us" map. Tip: open google.com/maps, right-click the spot you want, and the first number in the popup is the latitude (e.g. 52.5154444).',
        validation: { min: -90, max: 90 },
      }),
      mapLng: fields.number({
        label: 'Map pin longitude',
        description:
          'Longitude of the pin shown on the "Where to find us" map. Tip: open google.com/maps, right-click the spot you want, and the second number in the popup is the longitude (e.g. 13.3238611).',
        validation: { min: -180, max: 180 },
      }),
      rememberLabel: fields.text({
        label: 'Remember label',
        description: 'Small uppercase label shown above the room and meeting time (e.g. "remember:").',
      }),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function sponsorTiersSingleton(locale: Locale, pathSuffix: string, label: string) {
  return singleton({
    ...baseSingletonMeta(locale, pathSuffix, label),
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      subtitle: fields.text({ label: 'Subtitle' }),
      description: fields.text({ label: 'Description', multiline: true }),
      tierDescriptions: fields.object(
        {
          diamond: fields.text({ label: 'Diamond' }),
          platinum: fields.text({ label: 'Platinum' }),
          gold: fields.text({ label: 'Gold' }),
          silver: fields.text({ label: 'Silver' }),
          bronze: fields.text({ label: 'Bronze' }),
        },
        { label: 'Tier descriptions' },
      ),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function latestNewsSingleton(locale: Locale, pathSuffix: string, label: string) {
  return singleton({
    ...baseSingletonMeta(locale, pathSuffix, label),
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      description: fields.text({ label: 'Description', multiline: true }),
      buttonText: fields.text({ label: 'Primary button text' }),
      buttonHref: fields.text({ label: 'Primary button link' }),
      secondButtonText: fields.text({ label: 'Secondary button text' }),
      secondButtonHref: fields.text({ label: 'Secondary button link' }),
      instagramButtonText: fields.text({ label: 'Instagram button text' }),
      showMoreText: fields.text({
        label: 'Show more button text',
        description: 'Mobile only — label for the button that expands the list.',
      }),
      showLessText: fields.text({
        label: 'Show less button text',
        description: 'Mobile only — label for the button that collapses the list.',
      }),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function titleOnlySingleton(locale: Locale, pathSuffix: string, label: string) {
  return singleton({
    ...baseSingletonMeta(locale, pathSuffix, label),
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function legalPageSingleton(locale: Locale, pathSuffix: string, label: string) {
  return singleton({
    ...baseSingletonMeta(locale, pathSuffix, label),
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      subtitle: fields.text({ label: 'Subtitle' }),
      body: mdxBody(),
    },
  });
}


function pageTextHeroSingleton(locale: 'en' | 'de') {
  return singleton({
    label: `Landing hero + SEO (${locale.toUpperCase()})`,
    path: `src/content/page-text/${locale}/hero`,
    format: { contentField: 'body' },
    entryLayout: 'form',
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      subtitle: fields.text({ label: 'Subtitle' }),
      seoDescription: fields.text({ label: 'SEO description', multiline: true }),
      ctas: pageTextCtasField(),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function pageTextFaqSingleton(locale: 'en' | 'de') {
  return singleton({
    label: `FAQ (${locale.toUpperCase()})`,
    path: `src/content/page-text/${locale}/faq`,
    format: { contentField: 'body' },
    entryLayout: 'form',
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      subtitle: fields.text({ label: 'Subtitle' }),
      description: fields.text({ label: 'Description', multiline: true }),
      faqs: pageTextFaqsField(),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function pageTextMediaCategoriesSingleton(locale: 'en' | 'de') {
  return singleton({
    label: `Media categories (${locale.toUpperCase()})`,
    path: `src/content/page-text/${locale}/media/media-categories`,
    format: { contentField: 'body' },
    entryLayout: 'form',
    schema: {
      mediaCategories: pageTextMediaCategoriesField(),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function pageTextNavColumnsSingleton(locale: 'en' | 'de') {
  return singleton({
    label: `Footer navigation (${locale.toUpperCase()})`,
    path: `src/content/page-text/${locale}/nav-columns`,
    format: { contentField: 'body' },
    entryLayout: 'form',
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      navColumns: pageTextNavColumnsField(),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function pageTextContactDetailsSingleton(locale: 'en' | 'de') {
  return singleton({
    label: `Contact details (${locale.toUpperCase()})`,
    path: `src/content/page-text/${locale}/contact-details`,
    format: { contentField: 'body' },
    entryLayout: 'form',
    schema: {
      email: fields.text({
        label: 'Email',
        description: 'Shown on the Contact page.',
        validation: { isRequired: true, length: { min: 1 } },
      }),
      address: fields.text({
        label: 'Address',
        description: 'One line per row. Press Enter to start a new line. Shown on the Contact page and in the site footer.',
        multiline: true,
        validation: { isRequired: true, length: { min: 1 } },
      }),
      emailLabel: fields.text({
        label: 'Email card heading',
        description: 'Heading on the email card on the Contact page.',
      }),
      addressLabel: fields.text({
        label: 'Address card heading',
        description: 'Heading on the address card on the Contact page.',
      }),
      mapLinkText: fields.text({
        label: 'Map link text',
        description: 'Link text below the address that jumps to the map on the About us page.',
      }),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function pageTextSocialSingleton(locale: 'en' | 'de') {
  return singleton({
    label: `Social links (${locale.toUpperCase()})`,
    path: `src/content/page-text/${locale}/social`,
    format: { contentField: 'body' },
    entryLayout: 'form',
    schema: {
      socialLinks: pageTextSocialLinksField(),
      followLabel: fields.text({
        label: 'Follow card heading',
        description: 'Heading on the social-links card on the Contact page.',
      }),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function pageTextDonateSingleton(locale: 'en' | 'de') {
  return singleton({
    label: `Donate (${locale.toUpperCase()})`,
    path: `src/content/page-text/${locale}/donate`,
    format: { contentField: 'body' },
    entryLayout: 'form',
    schema: {
      title: fields.text({ label: 'Title', validation: { isRequired: true } }),
      description: fields.text({ label: 'Description', multiline: true }),
      items: pageTextItemsField(),
      accountHolder: fields.text({ label: 'Account holder' }),
      bankName: fields.text({ label: 'Bank name' }),
      iban: fields.text({ label: 'IBAN' }),
      bic: fields.text({ label: 'BIC' }),
      reference: fields.text({ label: 'Transfer reference' }),
      paypalUrl: fields.url({ label: 'PayPal URL' }),
      paypalButtonText: fields.text({ label: 'PayPal button text' }),
      orDividerText: fields.text({
        label: 'Or divider text',
        description: 'Small uppercase label shown between the sponsor CTA and the donation block on the Sponsors page (e.g. "Or").',
      }),
      bankToggleText: fields.text({
        label: 'Bank details toggle text',
        description: 'Label on the button that expands the bank transfer details.',
      }),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function pageTextSearchSingleton(locale: 'en' | 'de') {
  return singleton({
    label: `Search strings (${locale.toUpperCase()})`,
    path: `src/content/page-text/${locale}/site/search`,
    format: { contentField: 'body' },
    entryLayout: 'form',
    schema: {
      searchPlaceholder: fields.text({
        label: 'Search input placeholder',
        description: 'Shown inside the header search box before the user types.',
        validation: { isRequired: true },
      }),
      searchNoResultsText: fields.text({
        label: 'No results message',
        description: 'Shown in the search dropdown when a query returns nothing.',
        validation: { isRequired: true },
      }),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function pageTextSiteMetadataSingleton(locale: 'en' | 'de') {
  return singleton({
    label: `Site metadata (${locale.toUpperCase()})`,
    path: `src/content/page-text/${locale}/site/metadata`,
    format: { contentField: 'body' },
    entryLayout: 'form',
    schema: {
      title: fields.text({ label: 'Site title', validation: { isRequired: true } }),
      description: fields.text({
        label: 'Site description',
        description: 'Used as the default <meta name="description"> for the site.',
        multiline: true,
        validation: { isRequired: true },
      }),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function pageTextNavLinksCollection(locale: 'en' | 'de') {
  return collection({
    label: `Nav link lists (${locale.toUpperCase()})`,
    slugField: 'title',
    path: `src/content/page-text/${locale}/nav-links/*`,
    format: { contentField: 'body' },
    entryLayout: 'form',
    schema: {
      title: fields.slug({
        name: { label: 'Title', validation: { isRequired: true } },
        slug: {
          label: 'ID',
          description:
            'Auto-generated from the title — you don\'t need to touch this. Do not rename: these IDs (e.g. "header", "footer-bottom") are referenced directly from code. Renaming silently replaces the content with hardcoded English defaults.',
          validation: {
            length: { min: 3, max: 80 },
            pattern: {
              regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
              message: 'Lowercase letters, digits, and single hyphens only.',
            },
          },
        },
      }),
      navLinks: pageTextNavLinksField(),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

// Social platforms is an editor-driven catalogue: each entry owns an icon and
// a default hover color, and the Social links singleton references entries by
// slug via fields.relationship. Using a collection (not an array) keeps the
// icon path stable per slug — Keystatic only rewrites upload paths when the
// slug itself changes, so editors can freely add/remove/reorder Social links
// without losing files.
const socialPlatformsCollection = collection({
  label: 'Social platforms',
  slugField: 'label',
  path: 'src/content/social-platforms/*',
  columns: ['iconFile', 'defaultHoverColor'],
  format: { contentField: 'body' },
  entryLayout: 'form',
  schema: {
    label: fields.slug({
      name: {
        label: 'Label',
        description: 'Display name (e.g. "Instagram", "Bluesky"). Used as the accessible label in the footer and contact page.',
        validation: { isRequired: true },
      },
      slug: {
        label: 'ID',
        description:
          "Auto-generated from the label — you don't need to touch this. It's the lowercase ID used by Social links to reference this platform, and it matches the icon folder name on disk.",
      },
    }),
    iconFile: fields.file({
      label: 'Icon (SVG)',
      description: 'Upload a single-color SVG (24×24 viewBox, any fill). The icon renders as a silhouette via CSS mask so the hover color can be applied — colors inside the SVG are ignored.',
      directory: 'src/assets/social-icons',
      publicPath: '',
      validation: { isRequired: true },
    }),
    defaultHoverColor: fields.text({
      label: 'Default hover color (hex, optional)',
      description: "Brand color applied on hover when a Social link entry does not set its own hoverColor. Example: #0A66C2 for LinkedIn. Leave blank to fall back to the site accent color.",
    }),
    body: fields.emptyContent({ extension: 'mdx' }),
  },
});

// The People collection is locale-agnostic — name and portrait are shared
// across languages, only role and (optionally) the testimonial quote translate.
// Editors maintain a single record per person; the Faces of BEARS grid filters
// by `showInFaces`, the landing testimonials carousel filters by
// `showAsTestimonial`, and project Meet-the-Team entries link via a
// relationship() field on `projects`.
const peopleCollection = collection({
  label: 'People',
  slugField: 'name',
  path: 'src/content/people/*',
  columns: ['showInFaces', 'order', 'roleEn'],
  format: { contentField: 'body' },
  entryLayout: 'form',
  schema: {
    name: fields.slug({
      name: { label: 'Name', validation: { isRequired: true } },
      slug: {
        label: 'Filename / ID',
        description:
          "Auto-generated from the name — you don't need to touch this. It's used as the person's ID in relationships (projects' \"Head of project\", testimonials). Renaming breaks those references.",
      },
    }),
    roleEn: fields.text({
      label: 'Role (English)',
      validation: { isRequired: true },
    }),
    roleDe: fields.text({
      label: 'Rolle (Deutsch)',
      validation: { isRequired: true },
    }),
    coverImage: imageField('Portrait image', 'src/assets/people', '/src/assets/people/', { required: false }),
    coverImageDescription: fields.text({
      label: 'Portrait description / credit (optional)',
      description: 'Shown as a caption strip when this portrait appears on the Media page. Use it for any combination of caption and photographer credit (e.g. "Akshat at WS2025 — © 2025 Jane Doe").',
    }),
    showInFaces: fields.checkbox({
      label: 'Show in Faces of BEARS & Media page',
      description: 'Adds this portrait to the Faces of BEARS grid (About us page) and the People category on the Media page. Only enable with the person\'s consent.',
      defaultValue: false,
    }),
    order: fields.integer({
      label: 'Order',
      description: 'Lower numbers appear first wherever this person is shown (Faces of BEARS grid, Media page). Ignored if the person isn\'t shown anywhere.',
      defaultValue: 0,
      validation: { isRequired: true },
    }),
    body: fields.emptyContent({ extension: 'mdx' }),
  },
});

// Locale-agnostic singleton backing the landing-page testimonials carousel.
// One MDX file (src/content/testimonials/list.mdx) holds a drag-reorderable
// array of items. Each item shows as a compact form with a Person dropdown
// and the two quote translations — no filename, no order number, no
// identifier. Array position IS the carousel order.
function testimonialsSingleton() {
  return singleton({
    label: 'Testimonials',
    path: 'src/content/testimonials/list',
    format: { contentField: 'body' as const },
    entryLayout: 'form' as const,
    schema: {
      items: fields.array(
        fields.object({
          person: fields.relationship({
            label: 'Person',
            description: 'Pick from the People collection. If the person does not exist yet, create them in the People group first.',
            collection: 'people',
            validation: { isRequired: true },
          }),
          quoteEn: fields.text({
            label: 'Quote (English)',
            multiline: true,
            validation: { isRequired: true },
          }),
          quoteDe: fields.text({
            label: 'Zitat (Deutsch)',
            multiline: true,
            validation: { isRequired: true },
          }),
        }),
        {
          label: 'Testimonials',
          description: 'Drag to reorder — the order in this list is the order shown on the landing page.',
          itemLabel: (item) => item.fields.person.value || 'New testimonial',
        },
      ),
      body: fields.emptyContent({ extension: 'mdx' }),
    },
  });
}

function docsCollection(section: 'guides' | 'dev') {
  const sectionLabel = section === 'guides' ? 'Guides' : 'Dev Docs';
  return collection({
    label: `Docs – ${sectionLabel}`,
    slugField: 'title',
    path: `src/content/docs/${section}/*`,
    columns: ['order', 'group'],
    format: { contentField: 'body' },
    entryLayout: 'content',
    schema: {
      title: fields.slug({
        name: { label: 'Title', validation: { isRequired: true } },
        slug: {
          label: 'URL slug',
          description:
            "Auto-generated from the title — you don't need to touch this. Do not change after publishing: this appears in the doc's public URL (/docs/…). Renaming breaks inbound links, SEO, and shared bookmarks.",
          validation: {
            length: { min: 3, max: 80 },
            pattern: {
              regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
              message: 'Lowercase letters, digits, and single hyphens only.',
            },
          },
        },
      }),
      description: fields.text({ label: 'Description', multiline: true }),
      order: fields.integer({
        label: 'Order',
        description: 'Sort order within this section (lower = first).',
        defaultValue: 0,
        validation: { isRequired: true },
      }),
      group: fields.text({ label: 'Group (optional)' }),
      body: mdxBody(`src/assets/docs/${section}`, { includePreview: true }),
    },
  });
}

// ============================================================================
// SINGLETON-LIKE COLLECTIONS (not per locale / tier)
// ============================================================================

const heroSlides = collection({
  label: 'Hero Slides',
  slugField: 'alt',
  path: 'src/content/hero-slides/*',
  columns: ['order', 'shownText'],
  format: { contentField: 'body' },
  entryLayout: 'form',
  schema: {
    order: fields.integer({
      label: 'Order',
      description: 'Slides are shown in ascending order of this number. Ties fall back to filename.',
      defaultValue: 0,
      validation: { isRequired: true },
    }),
    alt: fields.slug({
      name: {
        label: 'Alt text / slide ID',
        description: 'Used as the filename and image alt text.',
        validation: { isRequired: true },
      },
      slug: {
        label: 'Filename',
        description:
          "Auto-generated from the alt text — you don't need to touch this.",
      },
    }),
    // Image and video uploads need different field types: fields.image
    // renders the thumbnail preview editors expect, while fields.file is the
    // only one that accepts video extensions. Keyed on a media-type select so
    // both branches share one upload slot in the form.
    media: fields.conditional(
      fields.select({
        label: 'Media type',
        options: [
          { label: 'Image', value: 'image' },
          { label: 'Video', value: 'video' },
        ],
        defaultValue: 'image',
      }),
      {
        image: fields.image({
          label: 'Image file',
          description: `Supported: ${IMAGE_EXTENSIONS.join(', ')}. ${IMAGE_SIZE_HINT}`,
          directory: 'src/assets/hero/landingpage',
          publicPath: '',
          validation: { isRequired: true },
        }),
        video: fields.file({
          label: 'Video file',
          description: 'Supported: mp4, webm, ogg. Larger files (>10 MB) will freeze the tab during upload — just let it run and it will go through eventually. Smaller files preferred (HandBrake/ffmpeg).',
          directory: 'src/assets/hero/landingpage',
          publicPath: '',
          validation: { isRequired: true },
        }),
      }
    ),
    shownText: fields.text({
      label: 'Overlay text / Media-page caption (optional)',
      description: 'Text shown over the slide on the homepage hero. The same text doubles as the caption strip when this image slide appears on /media (use it for any combination of caption and photographer credit).',
    }),
    displayInMedia: fields.checkbox({
      label: 'Show on the Media page',
      description: 'Appears in the Hero category on the Media page (images only — videos are skipped).',
      defaultValue: true,
    }),
    body: fields.emptyContent({ extension: 'mdx' }),
  },
});

const instagram = collection({
  label: 'Instagram Posts',
  slugField: 'url',
  path: 'src/content/instagram/*',
  columns: ['date', 'isDraft'],
  format: { contentField: 'body' },
  entryLayout: 'form',
  schema: {
    url: fields.slug({
      name: {
        label: 'Instagram post URL',
        description: 'Full URL of the Instagram post. Used as slug.',
        validation: { isRequired: true },
      },
      slug: {
        label: 'Filename',
        description:
          "Auto-generated from the post URL — you don't need to touch this.",
      },
    }),
    date: fields.date({
      label: 'Date',
      description: 'Posts are sorted newest first. Only the 3 most recent posts are shown on the homepage.',
      validation: { isRequired: true },
    }),
    isDraft: fields.checkbox({
      label: 'Draft',
      description: 'Drafts are hidden in production but visible in dev.',
      defaultValue: false,
    }),
    body: fields.emptyContent({ extension: 'mdx' }),
  },
});

// ============================================================================
// BRANDING — locale-agnostic singletons split into two tabs:
//   • `branding`        → logos + favicon + OG image (site identity)
//   • `defaultImages`   → fallback covers for posts / people / sponsors
//
// Fields storing assets under src/assets/ use bare filenames resolved through
// the globs in src/utils/imageGlobs.ts; fields storing assets under public/
// also store bare filenames, and consumers prepend `/` to build the URL.
// ============================================================================

function brandingSingleton() {
  return singleton({
    label: 'Branding / logos',
    path: 'src/content/branding/site-assets',
    format: { data: 'yaml' as const },
    entryLayout: 'form' as const,
    schema: {
      headerLogo: brandingAssetField('Header logo', 'src/assets/header'),
      footerLogo: brandingAssetField('Footer logo', 'src/assets/footer'),
      heroLogo: brandingAssetField('Landing hero logo', 'src/assets/hero/landingpage/logo'),
      favicon: publicAssetField('Favicon (browser tab icon)'),
      ogDefault: publicAssetField('Default social share image (Open Graph)'),
    },
  });
}

function defaultImagesSingleton() {
  return singleton({
    label: 'Default images',
    path: 'src/content/default-images/fallbacks',
    format: { data: 'yaml' as const },
    entryLayout: 'form' as const,
    schema: {
      defaultEventImage: brandingAssetField('Default event cover (fallback)', 'src/assets/default-images'),
      defaultProjectImage: brandingAssetField('Default project cover (fallback)', 'src/assets/default-images'),
      defaultSponsorImage: brandingAssetField('Default sponsor logo (fallback)', 'src/assets/default-images'),
      defaultFaceImage: brandingAssetField('Default person portrait (fallback)', 'src/assets/default-images'),
    },
  });
}

function landingSectionVisibilitySingleton() {
  return singleton({
    label: 'Landing — segments',
    path: 'src/content/landing-section-visibility/settings',
    format: { data: 'yaml' as const },
    entryLayout: 'form' as const,
    schema: {
      showHero: fields.checkbox({ label: 'Show landing hero', defaultValue: true }),
      showWhatIsBears: fields.checkbox({ label: 'Show "What is BEARS"', defaultValue: true }),
      showMeetTheTeam: fields.checkbox({ label: 'Show "Meet the Team"', defaultValue: true }),
      showBecomeSponsor: fields.checkbox({ label: 'Show "Become a sponsor"', defaultValue: true }),
      showLatestNews: fields.checkbox({ label: 'Show "Latest news"', defaultValue: true }),
      showTestimonials: fields.checkbox({ label: 'Show "Testimonials"', defaultValue: true }),
    },
  });
}

function aboutSectionVisibilitySingleton() {
  return singleton({
    label: 'About us — segments',
    path: 'src/content/about-section-visibility/settings',
    format: { data: 'yaml' as const },
    entryLayout: 'form' as const,
    schema: {
      showOurMission: fields.checkbox({ label: 'Show "Our Mission"', defaultValue: true }),
      showFacesOfBears: fields.checkbox({ label: 'Show "Faces of BEARS"', defaultValue: true }),
      showFindUs: fields.checkbox({ label: 'Show "Find us"', defaultValue: true }),
      showFaq: fields.checkbox({ label: 'Show FAQ', defaultValue: true }),
    },
  });
}

function sponsorsSectionVisibilitySingleton() {
  return singleton({
    label: 'Sponsors — segments',
    path: 'src/content/sponsors-section-visibility/settings',
    format: { data: 'yaml' as const },
    entryLayout: 'form' as const,
    schema: {
      showSponsorShowcase: fields.checkbox({ label: 'Show sponsor showcase (tier accordions)', defaultValue: true }),
      showBecomeSponsorCta: fields.checkbox({ label: 'Show "Become a sponsor" CTA card', defaultValue: true }),
      showDonateSection: fields.checkbox({ label: 'Show direct donation panel', defaultValue: true }),
      showProjectsCrosslink: fields.checkbox({ label: 'Show projects crosslink banner', defaultValue: true }),
    },
  });
}

function contactSectionVisibilitySingleton() {
  return singleton({
    label: 'Contact — segments',
    path: 'src/content/contact-section-visibility/settings',
    format: { data: 'yaml' as const },
    entryLayout: 'form' as const,
    schema: {
      showContactInfo: fields.checkbox({ label: 'Show contact info', defaultValue: true }),
      showAboutUsCrosslink: fields.checkbox({ label: 'Show "About us" crosslink banner', defaultValue: true }),
    },
  });
}

function mediaSectionVisibilitySingleton() {
  return singleton({
    label: 'Media — segments',
    path: 'src/content/media-section-visibility/settings',
    format: { data: 'yaml' as const },
    entryLayout: 'form' as const,
    schema: {
      showMediaPage: fields.checkbox({
        label: 'Show Media page',
        description: 'When off, /media returns 404 and the Media link is hidden from the footer.',
        defaultValue: true,
      }),
      showMediaContent: fields.checkbox({ label: 'Show media categories (and empty-state fallback)', defaultValue: true }),
    },
  });
}

// ============================================================================
// CONFIG
// ============================================================================

export default config({
  storage,
  ui: {
    brand: { name: 'BEARS' },
    navigation: {
      // --- Main content (no page-text mingled in) ---------------------------
      'Hero slides': ['heroSlides'],
      'Events': ['eventsEn', 'eventsDe'],
      'Projects': ['projectsEn', 'projectsDe'],
      'Sponsors': ['sponsorsDiamond', 'sponsorsPlatinum', 'sponsorsGold', 'sponsorsSilver', 'sponsorsBronze'],
      'People': ['people'],
      'Testimonials': ['testimonials'],
      'Contact & social': [
        'pageTextContactDetailsEn', 'pageTextContactDetailsDe',
        'socialPlatforms',
        'pageTextSocialEn', 'pageTextSocialDe',
        'instagram',
      ],
      // --- Page text (per-page sub-groups, clustered by "Page text — " prefix)
      'Static Page Text - Landing': [
        'pageTextHeroEn', 'pageTextHeroDe',
        'pageTextLandingWhatIsBearsEn', 'pageTextLandingWhatIsBearsDe',
        'pageTextLandingMeetTheTeamEn', 'pageTextLandingMeetTheTeamDe',
        'pageTextLandingTestimonialsEn', 'pageTextLandingTestimonialsDe',
        'pageTextLandingLatestNewsEn', 'pageTextLandingLatestNewsDe',
        'pageTextLandingBecomeSponsorEn', 'pageTextLandingBecomeSponsorDe',
      ],
      'Static Page Text - About us': [
        'pageTextAboutUsTitleEn', 'pageTextAboutUsTitleDe',
        'pageTextAboutUsOurMissionEn', 'pageTextAboutUsOurMissionDe',
        'pageTextAboutUsWhatsInItEn', 'pageTextAboutUsWhatsInItDe',
        'pageTextAboutUsFindUsEn', 'pageTextAboutUsFindUsDe',
        'pageTextAboutUsFacesOfBearsEn', 'pageTextAboutUsFacesOfBearsDe',
        'pageTextFaqEn', 'pageTextFaqDe',
        'pageTextAboutUsFaqCrosslinkEn', 'pageTextAboutUsFaqCrosslinkDe',
      ],
      'Static Page Text - Events': [
        'pageTextEventsTitleEn', 'pageTextEventsTitleDe',
        'pageTextEventsIntroEn', 'pageTextEventsIntroDe',
        'pageTextEventsEmptyStateEn', 'pageTextEventsEmptyStateDe',
        'pageTextEventsCrosslinkEn', 'pageTextEventsCrosslinkDe',
      ],
      'Static Page Text - Projects': [
        'pageTextProjectsTitleEn', 'pageTextProjectsTitleDe',
        'pageTextProjectsCategoriesIntroEn', 'pageTextProjectsCategoriesIntroDe',
        'pageTextProjectsCategoryRocketryEn', 'pageTextProjectsCategoryRocketryDe',
        'pageTextProjectsCategoryRoboticsEn', 'pageTextProjectsCategoryRoboticsDe',
        'pageTextProjectsCategoryScienceEn', 'pageTextProjectsCategoryScienceDe',
        'pageTextProjectsEmptyStateEn', 'pageTextProjectsEmptyStateDe',
        'pageTextProjectsCrosslinkEn', 'pageTextProjectsCrosslinkDe',
      ],
      'Static Page Text - Sponsors': [
        'pageTextSponsorsTitleEn', 'pageTextSponsorsTitleDe',
        'pageTextSponsorsIntroEn', 'pageTextSponsorsIntroDe',
        'pageTextSponsorsTiersEn', 'pageTextSponsorsTiersDe',
        'pageTextSponsorsBecomeSponsorCtaEn', 'pageTextSponsorsBecomeSponsorCtaDe',
        'pageTextSponsorsCrosslinkEn', 'pageTextSponsorsCrosslinkDe',
      ],
      'Static Page Text - Contact': [
        'pageTextContactTitleEn', 'pageTextContactTitleDe',
        'pageTextContactInfoEn', 'pageTextContactInfoDe',
        'pageTextContactCrosslinkEn', 'pageTextContactCrosslinkDe',
        'pageTextDonateEn', 'pageTextDonateDe',
      ],
      'Static Page Text - Media': [
        'pageTextMediaTitleEn', 'pageTextMediaTitleDe',
        'pageTextMediaCategoriesEn', 'pageTextMediaCategoriesDe',
      ],
      'Static Page Text - Legal & utility pages': [
        'pageTextImprintEn', 'pageTextImprintDe',
        'pageTextDatenschutzEn', 'pageTextDatenschutzDe',
        'pageText404En', 'pageText404De',
      ],
      'Static Page Text - Site-wide (nav, meta)': [
        'pageTextNavLinksEn', 'pageTextNavLinksDe',
        'pageTextNavColumnsEn', 'pageTextNavColumnsDe',
        'pageTextSiteMetadataEn', 'pageTextSiteMetadataDe',
        'pageTextSearchEn', 'pageTextSearchDe',
        'branding',
        'defaultImages',
      ],
      'Segment Visibility': [
        'landingSectionVisibility',
        'aboutSectionVisibility',
        'sponsorsSectionVisibility',
        'contactSectionVisibility',
        'mediaSectionVisibility',
      ],
      // --- Docs -------------------------------------------------------------
      'Docs': ['docsGuides', 'docsDev'],
    },
  },
  collections: {
    // Bilingual
    eventsEn: eventsCollection('en'),
    eventsDe: eventsCollection('de'),
    projectsEn: projectsCollection('en'),
    projectsDe: projectsCollection('de'),
    pageTextNavLinksEn: pageTextNavLinksCollection('en'),
    pageTextNavLinksDe: pageTextNavLinksCollection('de'),
    // Locale-agnostic: one entry per person; roles translate inline.
    people: peopleCollection,
    // Editor-driven platform catalogue referenced by the Social links singleton.
    socialPlatforms: socialPlatformsCollection,
    // Tier-split sponsors
    sponsorsDiamond: sponsorsCollection('diamond'),
    sponsorsPlatinum: sponsorsCollection('platinum'),
    sponsorsGold: sponsorsCollection('gold'),
    sponsorsSilver: sponsorsCollection('silver'),
    sponsorsBronze: sponsorsCollection('bronze'),
    // Section-split docs
    docsGuides: docsCollection('guides'),
    docsDev: docsCollection('dev'),
    // Flat
    heroSlides,
    instagram,
  },
  singletons: {
    // Site-wide
    pageTextHeroEn: pageTextHeroSingleton('en'),
    pageTextHeroDe: pageTextHeroSingleton('de'),
    pageTextSiteMetadataEn: pageTextSiteMetadataSingleton('en'),
    pageTextSiteMetadataDe: pageTextSiteMetadataSingleton('de'),
    pageTextSearchEn: pageTextSearchSingleton('en'),
    pageTextSearchDe: pageTextSearchSingleton('de'),
    pageTextFaqEn: pageTextFaqSingleton('en'),
    pageTextFaqDe: pageTextFaqSingleton('de'),
    pageTextMediaTitleEn: pageHeaderSingleton('en', 'media/media-title', 'Media — page header', 'src/assets/hero/media'),
    pageTextMediaTitleDe: pageHeaderSingleton('de', 'media/media-title', 'Media — page header', 'src/assets/hero/media'),
    pageTextMediaCategoriesEn: pageTextMediaCategoriesSingleton('en'),
    pageTextMediaCategoriesDe: pageTextMediaCategoriesSingleton('de'),
    pageTextNavColumnsEn: pageTextNavColumnsSingleton('en'),
    pageTextNavColumnsDe: pageTextNavColumnsSingleton('de'),
    pageTextContactDetailsEn: pageTextContactDetailsSingleton('en'),
    pageTextContactDetailsDe: pageTextContactDetailsSingleton('de'),
    pageTextSocialEn: pageTextSocialSingleton('en'),
    pageTextSocialDe: pageTextSocialSingleton('de'),
    pageTextDonateEn: pageTextDonateSingleton('en'),
    pageTextDonateDe: pageTextDonateSingleton('de'),
    // Landing page sections
    pageTextLandingWhatIsBearsEn: sectionWithButtonAndImagesSingleton('en', 'landing/what-is-bears', 'Landing — What is BEARS?'),
    pageTextLandingWhatIsBearsDe: sectionWithButtonSingleton('de', 'landing/what-is-bears', 'Landing — What is BEARS?'),
    pageTextLandingMeetTheTeamEn: titleOnlySingleton('en', 'landing/meet-the-team', 'Landing — Meet the team heading'),
    pageTextLandingMeetTheTeamDe: titleOnlySingleton('de', 'landing/meet-the-team', 'Landing — Meet the team heading'),
    pageTextLandingTestimonialsEn: titleOnlySingleton('en', 'landing/testimonials', 'Landing — Testimonials heading'),
    pageTextLandingTestimonialsDe: titleOnlySingleton('de', 'landing/testimonials', 'Landing — Testimonials heading'),
    pageTextLandingLatestNewsEn: latestNewsSingleton('en', 'landing/latest-news', 'Landing — Latest news'),
    pageTextLandingLatestNewsDe: latestNewsSingleton('de', 'landing/latest-news', 'Landing — Latest news'),
    pageTextLandingBecomeSponsorEn: sectionWithButtonSingleton('en', 'landing/become-sponsor', 'Landing — Become a sponsor'),
    pageTextLandingBecomeSponsorDe: sectionWithButtonSingleton('de', 'landing/become-sponsor', 'Landing — Become a sponsor'),
    // About us page sections
    pageTextAboutUsTitleEn: pageHeaderSingleton('en', 'about-us/about-us-title', 'About us — page header', 'src/assets/hero/about-us'),
    pageTextAboutUsTitleDe: pageHeaderSingleton('de', 'about-us/about-us-title', 'About us — page header', 'src/assets/hero/about-us'),
    pageTextAboutUsOurMissionEn: sectionWithImageSingleton('en', 'about-us/our-mission', 'About us — Our mission', 'src/assets/about-us/our-mission'),
    pageTextAboutUsOurMissionDe: sectionWithImageSingleton('de', 'about-us/our-mission', 'About us — Our mission', 'src/assets/about-us/our-mission'),
    pageTextAboutUsWhatsInItEn: titledListSectionSingleton('en', 'about-us/whats-in-it', "About us — What's in it for you"),
    pageTextAboutUsWhatsInItDe: titledListSectionSingleton('de', 'about-us/whats-in-it', "About us — What's in it for you"),
    pageTextAboutUsFindUsEn: findUsSingleton('en', 'about-us/find-us', 'About us — When/where to find us'),
    pageTextAboutUsFindUsDe: findUsSingleton('de', 'about-us/find-us', 'About us — When/where to find us'),
    pageTextAboutUsFacesOfBearsEn: sectionSingleton('en', 'about-us/faces-of-bears', 'About us — Faces of BEARS heading'),
    pageTextAboutUsFacesOfBearsDe: sectionSingleton('de', 'about-us/faces-of-bears', 'About us — Faces of BEARS heading'),
    pageTextAboutUsFaqCrosslinkEn: crosslinkSingleton('en', 'about-us/faq-crosslink', 'About us — FAQ crosslink'),
    pageTextAboutUsFaqCrosslinkDe: crosslinkSingleton('de', 'about-us/faq-crosslink', 'About us — FAQ crosslink'),
    // Contact page sections
    pageTextContactTitleEn: pageHeaderSingleton('en', 'contact/contact-title', 'Contact — page header', 'src/assets/hero/contact'),
    pageTextContactTitleDe: pageHeaderSingleton('de', 'contact/contact-title', 'Contact — page header', 'src/assets/hero/contact'),
    pageTextContactInfoEn: sectionSingleton('en', 'contact/contact-info', 'Contact — Reach out info'),
    pageTextContactInfoDe: sectionSingleton('de', 'contact/contact-info', 'Contact — Reach out info'),
    pageTextContactCrosslinkEn: crosslinkSingleton('en', 'contact/contact-crosslink', 'Contact — Join crosslink'),
    pageTextContactCrosslinkDe: crosslinkSingleton('de', 'contact/contact-crosslink', 'Contact — Join crosslink'),
    // Events page sections
    pageTextEventsTitleEn: pageHeaderSingleton('en', 'events/events-title', 'Events — page header', 'src/assets/hero/events'),
    pageTextEventsTitleDe: pageHeaderSingleton('de', 'events/events-title', 'Events — page header', 'src/assets/hero/events'),
    pageTextEventsIntroEn: sectionSingleton('en', 'events/events-intro', 'Events — Intro'),
    pageTextEventsIntroDe: sectionSingleton('de', 'events/events-intro', 'Events — Intro'),
    pageTextEventsEmptyStateEn: sectionSingleton('en', 'events/events-empty-state', 'Events — Empty state'),
    pageTextEventsEmptyStateDe: sectionSingleton('de', 'events/events-empty-state', 'Events — Empty state'),
    pageTextEventsCrosslinkEn: crosslinkSingleton('en', 'events/events-crosslink', 'Events — Projects crosslink'),
    pageTextEventsCrosslinkDe: crosslinkSingleton('de', 'events/events-crosslink', 'Events — Projects crosslink'),
    // Projects page sections
    pageTextProjectsTitleEn: pageHeaderSingleton('en', 'projects/projects-title', 'Projects — page header', 'src/assets/hero/projects'),
    pageTextProjectsTitleDe: pageHeaderSingleton('de', 'projects/projects-title', 'Projects — page header', 'src/assets/hero/projects'),
    pageTextProjectsCategoriesIntroEn: sectionSingleton('en', 'projects/categories-intro', 'Projects — Categories intro'),
    pageTextProjectsCategoriesIntroDe: sectionSingleton('de', 'projects/categories-intro', 'Projects — Categories intro'),
    pageTextProjectsCategoryRocketryEn: sectionSingleton('en', 'projects/category-experimental-rocketry', 'Projects — Category: experimental rocketry'),
    pageTextProjectsCategoryRocketryDe: sectionSingleton('de', 'projects/category-experimental-rocketry', 'Projects — Category: experimental rocketry'),
    pageTextProjectsCategoryRoboticsEn: sectionSingleton('en', 'projects/category-robotics', 'Projects — Category: robotics'),
    pageTextProjectsCategoryRoboticsDe: sectionSingleton('de', 'projects/category-robotics', 'Projects — Category: robotics'),
    pageTextProjectsCategoryScienceEn: sectionSingleton('en', 'projects/category-science-and-experiments', 'Projects — Category: science & experiments'),
    pageTextProjectsCategoryScienceDe: sectionSingleton('de', 'projects/category-science-and-experiments', 'Projects — Category: science & experiments'),
    pageTextProjectsEmptyStateEn: sectionSingleton('en', 'projects/projects-empty-state', 'Projects — Empty state'),
    pageTextProjectsEmptyStateDe: sectionSingleton('de', 'projects/projects-empty-state', 'Projects — Empty state'),
    pageTextProjectsCrosslinkEn: crosslinkSingleton('en', 'projects/projects-crosslink', 'Projects — Events crosslink'),
    pageTextProjectsCrosslinkDe: crosslinkSingleton('de', 'projects/projects-crosslink', 'Projects — Events crosslink'),
    // Sponsors page sections
    pageTextSponsorsTitleEn: pageHeaderSingleton('en', 'sponsors/sponsors-title', 'Sponsors — page header', 'src/assets/hero/sponsors'),
    pageTextSponsorsTitleDe: pageHeaderSingleton('de', 'sponsors/sponsors-title', 'Sponsors — page header', 'src/assets/hero/sponsors'),
    pageTextSponsorsIntroEn: sectionSingleton('en', 'sponsors/sponsors-intro', 'Sponsors — Intro'),
    pageTextSponsorsIntroDe: sectionSingleton('de', 'sponsors/sponsors-intro', 'Sponsors — Intro'),
    pageTextSponsorsTiersEn: sponsorTiersSingleton('en', 'sponsors/sponsor-tiers', 'Sponsors — Tier descriptions'),
    pageTextSponsorsTiersDe: sponsorTiersSingleton('de', 'sponsors/sponsor-tiers', 'Sponsors — Tier descriptions'),
    pageTextSponsorsBecomeSponsorCtaEn: sectionWithButtonSingleton('en', 'sponsors/become-sponsor-cta', 'Sponsors — Become a sponsor CTA'),
    pageTextSponsorsBecomeSponsorCtaDe: sectionWithButtonSingleton('de', 'sponsors/become-sponsor-cta', 'Sponsors — Become a sponsor CTA'),
    pageTextSponsorsCrosslinkEn: crosslinkSingleton('en', 'sponsors/sponsors-crosslink', 'Sponsors — Projects crosslink'),
    pageTextSponsorsCrosslinkDe: crosslinkSingleton('de', 'sponsors/sponsors-crosslink', 'Sponsors — Projects crosslink'),
    // Legal & utility pages
    pageText404En: sectionWithButtonSingleton('en', '404/not-found', '404 — Not found'),
    pageText404De: sectionWithButtonSingleton('de', '404/not-found', '404 — Not found'),
    pageTextDatenschutzEn: legalPageSingleton('en', 'datenschutz/datenschutz', 'Privacy policy'),
    pageTextDatenschutzDe: legalPageSingleton('de', 'datenschutz/datenschutz', 'Privacy policy'),
    pageTextImprintEn: legalPageSingleton('en', 'imprint/imprint', 'Imprint'),
    pageTextImprintDe: legalPageSingleton('de', 'imprint/imprint', 'Imprint'),
    // Site-wide branding (locale-agnostic)
    branding: brandingSingleton(),
    defaultImages: defaultImagesSingleton(),
    landingSectionVisibility: landingSectionVisibilitySingleton(),
    aboutSectionVisibility: aboutSectionVisibilitySingleton(),
    sponsorsSectionVisibility: sponsorsSectionVisibilitySingleton(),
    contactSectionVisibility: contactSectionVisibilitySingleton(),
    mediaSectionVisibility: mediaSectionVisibilitySingleton(),
    // Landing-page testimonials carousel — single YAML file with a
    // drag-reorderable array of { person, quoteEn, quoteDe }.
    testimonials: testimonialsSingleton(),
  },
});
