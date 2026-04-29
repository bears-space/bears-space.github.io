import type { ImageMetadata } from 'astro';

/**
 * Image with required alt text for accessibility.
 * Used by ImageGrid and other image display components.
 */
/**
 * Canonical shape for an image displayed by `<Img>` and the components built
 * on top of it (ImageGrid, CollapsibleImageGrid, MediaAccordion). Alt text is
 * required for accessibility; description is optional and, when set, renders
 * as a gradient overlay on the image (and again beneath the enlarged image
 * inside the click-to-enlarge modal). Use `description` for any combination
 * of caption + photographer credit — there's no separate copyright field.
 *
 * Note: the overlay only renders inside `<Img>`'s click-to-enlarge wrapper
 * (the default mode). Surfaces that pass `enableClickToEnlarge={false}`
 * (custom hero banners, FaceCard, SponsorTier, TestimonialCard, etc.) won't
 * show the strip — their bespoke layouts own their own visuals. The
 * description still gets captured for editorial use either way.
 */
export interface ImageWithAlt {
  /** Image file to display — imported ImageMetadata or string path resolved by `<Img>`. */
  image: ImageMetadata | string;
  /** Descriptive alt text for accessibility (required). */
  alt: string;
  /** Optional caption shown in the bottom gradient overlay and in the modal. */
  description?: string;
}
