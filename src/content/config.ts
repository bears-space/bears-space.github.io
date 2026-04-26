import { defineCollection, reference, z } from 'astro:content';
import { CoverImageType, CategoryEventEnum, CategoryProjectEnum } from '@types';
import { IMAGE_EXTENSION_REGEX, VALID_EXTENSIONS_MESSAGE } from '@utils/imageConstants';

/**
 * Helper for validating image file extensions
 * Ensures image filenames have valid extensions matching supported glob patterns
 */
const validateImageExtension = (value: string | undefined) => {
  if (!value) return true; // Allow undefined for optional fields
  return IMAGE_EXTENSION_REGEX.test(value);
};

/** Social-platform icons must be SVGs (rendered as silhouettes via CSS mask). */
const validateSvgExtension = (value: string) => /\.svg$/i.test(value);

const sponsorsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    order: z.number(),
    logo: z.string().refine(
      validateImageExtension,
      { message: `logo must have a valid image extension: ${VALID_EXTENSIONS_MESSAGE}` }
    ),
    url: z.string().url().optional(),
    bgColor: z.string().default('#ffffff'),
    // tier is automatically derived from folder structure (bronze/, silver/, gold/)
    // and does not need to be specified in frontmatter
  }),
});

const eventsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.date(),
    categoryEvent: CategoryEventEnum,
    coverImage: z.string().refine(
      validateImageExtension,
      { message: `coverImage must have a valid image extension: ${VALID_EXTENSIONS_MESSAGE}` }
    ),
    isDraft: z.boolean().default(false).optional(),
  }).transform((data) => {
    // Derive coverImageType from coverImage presence
    const coverImageType: z.infer<typeof CoverImageType> = data.coverImage ? "CUSTOM" : "DEFAULT";
    return {
      ...data,
      coverImageType,
    };
  }),
});

const projectsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.date(),
    categoryProject: CategoryProjectEnum,
    coverImage: z.string().refine(
      validateImageExtension,
      { message: `coverImage must have a valid image extension: ${VALID_EXTENSIONS_MESSAGE}` }
    ),
    isDraft: z.boolean().default(false).optional(),
    displayMeetTheTeam: z.boolean().optional(),
    // Reference into the `people` collection. Replaces the old flat
    // headOfProject (string) + personImage (filename) pair. Required when
    // displayMeetTheTeam is true (enforced by the .refine() below).
    person: reference('people').optional(),
    isProjectCompleted: z.boolean(),
  }).refine(
    (data) => !(data.displayMeetTheTeam === true && !data.person),
    {
      message: "person is required when displayMeetTheTeam is true",
      path: ["person"],
    }
  ).transform((data) => {
    // Derive coverImageType from coverImage presence
    const coverImageType: z.infer<typeof CoverImageType> = data.coverImage ? "CUSTOM" : "DEFAULT";
    return {
      ...data,
      coverImageType,
    };
  }),
});

/**
 * Helper for validating media file extensions (images + videos)
 */
const validateMediaExtension = (value: string | undefined) => {
  if (!value) return true;
  // Allow image extensions and video extensions
  return IMAGE_EXTENSION_REGEX.test(value) || /\.(mp4|webm|ogg)$/i.test(value);
};

const heroSlidesCollection = defineCollection({
  type: 'content',
  schema: z.object({
    order: z.number(),
    alt: z.string(),
    shownText: z.string().optional(),
    // Mirrors the Keystatic `fields.conditional` on media: the admin UI splits
    // uploads into an image branch (with thumbnail preview) and a video branch,
    // serialized as { discriminant, value } in the YAML frontmatter.
    media: z.discriminatedUnion('discriminant', [
      z.object({
        discriminant: z.literal('image'),
        value: z.string().refine(
          validateImageExtension,
          { message: `media value must have a valid image extension: ${VALID_EXTENSIONS_MESSAGE}` }
        ),
      }),
      z.object({
        discriminant: z.literal('video'),
        value: z.string().refine(
          validateMediaExtension,
          { message: `media value must have a valid video extension: mp4, webm, or ogg` }
        ),
      }),
    ]),
  }),
});

const instagramCollection = defineCollection({
  type: 'content',
  schema: z.object({
    url: z.string().url(),
    date: z.date(),
    isDraft: z.boolean().default(false).optional(),
  }),
});

const peopleCollection = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    roleEn: z.string(),
    roleDe: z.string(),
    coverImage: z.string().refine(
      validateImageExtension,
      { message: `coverImage must have a valid image extension: ${VALID_EXTENSIONS_MESSAGE}` }
    ),
    showInFaces: z.boolean().default(true),
    order: z.number().default(0),
  }),
});

// Single-entry content collection backing the landing-page Testimonials
// carousel. The editor manages one drag-reorderable list via a Keystatic
// singleton; the array order in the file IS the display order on the
// landing page (no sort key needed). Each item references a person from the
// `people` collection and carries both quote translations inline. Stored as
// MDX with an empty, uneditable body for consistency with other content-type
// collections in this project.
const testimonialsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    items: z.array(z.object({
      person: reference('people'),
      quoteEn: z.string(),
      quoteDe: z.string(),
    })),
  }),
});

const docsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    order: z.number(),
    group: z.string().optional(),
  }),
});

const pageTextCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    seoDescription: z.string().optional(),
    buttonText: z.string().optional(),
    buttonHref: z.string().optional(),
    secondButtonText: z.string().optional(),
    secondButtonHref: z.string().optional(),
    ctas: z.array(z.object({
      title: z.string(),
      description: z.string(),
      href: z.string(),
    })).max(4).optional(),
    items: z.array(z.string()).optional(),
    titledItems: z.array(z.object({
      title: z.string(),
      description: z.string().optional(),
    })).optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    room: z.string().optional(),
    schedule: z.string().optional(),
    mapLat: z.number().min(-90).max(90).optional(),
    mapLng: z.number().min(-180).max(180).optional(),
    socialLinks: z.array(z.object({
      platform: reference('social-platforms'),
      url: z.string().url(),
      hoverColor: z.string().optional(),
    })).optional(),
    navLinks: z.array(z.object({
      label: z.string(),
      href: z.string(),
    })).optional(),
    navColumns: z.array(z.object({
      heading: z.string(),
      href: z.string(),
      links: z.array(z.object({
        label: z.string(),
        href: z.string(),
      })),
    })).optional(),
    faqs: z.array(z.object({
      question: z.string(),
      answer: z.string(),
    })).optional(),
    instagramButtonText: z.string().optional(),
    image: z.string().refine(
      validateImageExtension,
      { message: `image must have a valid image extension: ${VALID_EXTENSIONS_MESSAGE}` },
    ).optional(),
    imageAlt: z.string().optional(),
    carouselImages: z.array(z.object({
      src: z.string().refine(
        validateImageExtension,
        { message: `src must have a valid image extension: ${VALID_EXTENSIONS_MESSAGE}` },
      ),
      alt: z.string().min(1),
    })).optional(),
    mediaCategories: z.array(z.object({
      id: z.string(),
      label: z.string(),
    })).optional(),
    bankName: z.string().optional(),
    accountHolder: z.string().optional(),
    iban: z.string().optional(),
    bic: z.string().optional(),
    reference: z.string().optional(),
    paypalUrl: z.string().url().optional(),
    paypalButtonText: z.string().optional(),
    tierDescriptions: z.object({
      diamond: z.string().optional(),
      platinum: z.string().optional(),
      gold: z.string().optional(),
      silver: z.string().optional(),
      bronze: z.string().optional(),
    }).optional(),
    showMoreText: z.string().optional(),
    showLessText: z.string().optional(),
    rememberLabel: z.string().optional(),
    emailLabel: z.string().optional(),
    addressLabel: z.string().optional(),
    mapLinkText: z.string().optional(),
    followLabel: z.string().optional(),
    orDividerText: z.string().optional(),
    bankToggleText: z.string().optional(),
    searchPlaceholder: z.string().optional(),
    searchNoResultsText: z.string().optional(),
  }).refine(d => !d.buttonText || d.buttonHref, {
    message: 'buttonHref is required when buttonText is set',
    path: ['buttonHref'],
  }).refine(d => !d.buttonHref || d.buttonText, {
    message: 'buttonText is required when buttonHref is set',
    path: ['buttonText'],
  }).refine(d => !d.secondButtonText || d.secondButtonHref, {
    message: 'secondButtonHref is required when secondButtonText is set',
    path: ['secondButtonHref'],
  }).refine(d => !d.secondButtonHref || d.secondButtonText, {
    message: 'secondButtonText is required when secondButtonHref is set',
    path: ['secondButtonText'],
  }),
});

const socialPlatformsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    label: z.string(),
    iconFile: z.string().refine(
      validateSvgExtension,
      { message: 'iconFile must be an SVG (.svg)' },
    ),
    defaultHoverColor: z.string().optional(),
  }),
});

const brandingImage = () =>
  z.string().refine(
    validateImageExtension,
    { message: `image must have a valid image extension: ${VALID_EXTENSIONS_MESSAGE}` }
  );

const brandingCollection = defineCollection({
  type: 'data',
  schema: z.object({
    headerLogo: brandingImage(),
    footerLogo: brandingImage(),
    heroLogo: brandingImage(),
    favicon: brandingImage(),
    ogDefault: brandingImage(),
  }),
});

const defaultImagesCollection = defineCollection({
  type: 'data',
  schema: z.object({
    defaultEventImage: brandingImage(),
    defaultProjectImage: brandingImage(),
    defaultSponsorImage: brandingImage(),
    defaultFaceImage: brandingImage(),
  }),
});

const landingSectionVisibilityCollection = defineCollection({
  type: 'data',
  schema: z.object({
    showHero: z.boolean().default(true),
    showWhatIsBears: z.boolean().default(true),
    showMeetTheTeam: z.boolean().default(true),
    showBecomeSponsor: z.boolean().default(true),
    showLatestNews: z.boolean().default(true),
    showTestimonials: z.boolean().default(true),
  }),
});

export const collections = {
  sponsors: sponsorsCollection,
  events: eventsCollection,
  projects: projectsCollection,
  'hero-slides': heroSlidesCollection,
  'page-text': pageTextCollection,
  instagram: instagramCollection,
  people: peopleCollection,
  testimonials: testimonialsCollection,
  docs: docsCollection,
  'social-platforms': socialPlatformsCollection,
  branding: brandingCollection,
  'default-images': defaultImagesCollection,
  'landing-section-visibility': landingSectionVisibilityCollection,
};
