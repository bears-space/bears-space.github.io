/**
 * Centralized glob pattern definitions for image loading
 *
 * These patterns are used by the imageLoader utilities to dynamically
 * import images from the assets directory. By centralizing them here,
 * we ensure consistency across all components and pages.
 *
 * Note: Glob patterns use `*.*` so that files with uppercase extensions
 * (e.g. .JPG, .PNG) are picked up by Vite. Each glob is then filtered
 * through filterImageGlob/filterMediaGlob to keep only valid formats.
 * Supported formats are defined in src/utils/imageConstants.ts
 */
import type { ImageMetadata } from 'astro';
import { filterImageGlob, filterMediaGlob } from './imageConstants';

/**
 * Type for glob import results
 */
export type ImageGlob = Record<string, () => Promise<{ default: ImageMetadata }>>;

/**
 * Event cover images
 * Used by: events.astro, [slug].astro, LatestNews.astro
 * Note: includes subdirectories so Keystatic-scoped uploads (e.g. `test/coverImage.jpg`) resolve.
 */
export const eventImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/events/**/*.*"),
);

/**
 * Project cover images
 * Used by: projects.astro, [slug].astro, LatestNews.astro
 * Note: includes subdirectories so Keystatic-scoped uploads resolve.
 */
export const projectImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/projects/**/*.*"),
);

/**
 * Sponsor logo images
 * Used by: BecomeSponsor.astro
 * Note: Includes subdirectories for tier-based organization
 */
export const sponsorLogos: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/sponsors/**/*.*"),
);

/**
 * WhatIsBears carousel images
 * Used by: WhatIsBears.astro
 * Note: includes subdirectories so Keystatic per-entry subfolder uploads resolve.
 */
export const whatIsBearsImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/whatIsBears/**/*.*"),
);

/**
 * Our Mission hero image
 * Used by: OurMission.astro
 */
export const ourMissionImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/about-us/our-mission/*.*"),
);

/**
 * People portrait images (Faces of BEARS grid + project Meet-the-Team leads).
 * Used by: FacesOfBears.astro, MeetTheTeam.astro, and the People-category
 * branch on /media (via getMediaPeople + loadCollectionImages).
 * Files live at /src/assets/people/{slug}/coverImage.{ext} following the
 * Keystatic per-entry-subfolder convention.
 */
export const peopleImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/people/**/*.*"),
);

/**
 * Sub-page hero images
 * Used by: about-us.astro, events.astro, projects.astro, media.astro, sponsors.astro, contact.astro
 */
export const aboutHeroImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/hero/about-us/*.*"),
);
export const eventsHeroImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/hero/events/*.*"),
);
export const projectsHeroImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/hero/projects/*.*"),
);
export const mediaHeroImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/hero/media/*.*"),
);
export const sponsorsHeroImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/hero/sponsors/*.*"),
);
export const contactHeroImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/hero/contact/*.*"),
);

/**
 * Header logo image
 * Used by: Header.astro
 * Place a single image in this directory to use as the site header logo.
 */
export const headerLogoImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/header/*.*"),
);

/**
 * Footer logo image
 * Used by: Footer.astro
 * Place a single image in this directory to use as the site footer logo.
 */
export const footerLogoImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/footer/*.*"),
);

/**
 * Landing hero logo image
 * Used by: LandingHero.astro
 * Place a single image in this directory to use as the landing page hero logo.
 */
export const heroLogoImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/hero/landingpage/logo/*.*"),
);

/**
 * Landing Hero background images
 * Used by: LandingHero.astro
 * Note: recursive so Keystatic per-slide subfolder uploads resolve
 * (`src/assets/hero/landingpage/<slug>/media.<ext>`) alongside legacy
 * flat filenames. The `logo/` subfolder is harmlessly included too —
 * lookups are by full path, so there is no collision.
 */
export const heroImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/hero/landingpage/**/*.*"),
);

/**
 * Default fallback images (event/project/sponsor/face).
 * Filenames are chosen via the `branding` content entry; this glob resolves
 * whichever file the editor has set for each slot.
 */
export const defaultImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/default-images/*.*"),
);

/**
 * Flat glob across every asset subtree. Used by Img.astro to resolve string
 * srcs coming from Keystatic uploads (e.g. "/src/assets/events/<slug>/foo.jpg")
 * without having to know which collection the Img sits in.
 */
export const allAssetImages: ImageGlob = filterImageGlob(
  import.meta.glob<{ default: ImageMetadata }>("/src/assets/**/*.*"),
);

/**
 * Social-link SVG icons uploaded via Keystatic.
 * Used by: Footer.astro, ContactInfo.astro
 * Imported as URLs (not optimised) because icons render via CSS mask-image,
 * which operates on the SVG silhouette rather than its path data.
 */
export const socialIconFiles = import.meta.glob<string>(
  "/src/assets/social-icons/**/*.svg",
  { query: '?url', import: 'default' },
);

/**
 * Type for media glob results (images and videos)
 */
export type MediaGlob = Record<string, () => Promise<{ default: string }>>;

/**
 * Landing Hero all media (images + videos)
 * Used by: LandingHero.astro
 * Includes: jpg, jpeg, png, webp, mp4, webm, ogg
 * Note: recursive so Keystatic per-slide subfolder uploads resolve.
 */
export const heroMedia: MediaGlob = filterMediaGlob(
  import.meta.glob<{ default: string }>(
    "/src/assets/hero/landingpage/**/*.*",
    { eager: false },
  ),
);
