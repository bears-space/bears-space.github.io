/**
 * Keystatic MDX component registry.
 *
 * Each entry here lets content editors insert the matching `.astro` MDX
 * component via the Keystatic editor toolbar. The React previews rendered
 * inside Keystatic are intentionally simple visual placeholders — the real
 * Astro components render at build time.
 *
 * When you add, rename, or change the prop shape of a component in
 * src/components/mdx/, update both this registry AND the corresponding
 * Astro component. Keep the field names and types in sync.
 */
import React from 'react';
import { fields, NotEditable } from '@keystatic/core';
import { block, inline, wrapper, mark, repeating } from '@keystatic/core/content-components';

// ============================================================================
// PREVIEW HELPERS — minimal styles kept inline to avoid coupling to site CSS
//
// Keystatic supports both light and dark themes. We avoid hardcoded light
// backgrounds / dark text (which disappear on the dark theme) by using
// semi-transparent colors derived from `currentColor`, so the previews adapt
// to whichever theme Keystatic is showing.
// ============================================================================

const box: React.CSSProperties = {
  border: '1px dashed color-mix(in srgb, currentColor 35%, transparent)',
  borderRadius: 6,
  padding: '0.75rem 1rem',
  margin: '0.5rem 0',
  background: 'color-mix(in srgb, currentColor 5%, transparent)',
  fontFamily: 'sans-serif',
  fontSize: 14,
  color: 'inherit',
};

const label: React.CSSProperties = {
  fontWeight: 600,
  opacity: 0.75,
  textTransform: 'uppercase',
  fontSize: 11,
  letterSpacing: 0.5,
};

// ============================================================================
// IMAGE BLOCK FACTORIES
//
// `fields.image` requires a static `directory`, so to let every body-field
// write uploads into its own collection's asset folder we build the image
// blocks per-collection via `buildMdxComponents({ imageRoot })`. Callers
// without an imageRoot (page-text, hero-slides, instagram) get the legacy
// text-input variant so bodies written against the old schema keep loading.
// ============================================================================

function makeImgBlock(imageRoot?: string) {
  if (!imageRoot) {
    return block({
      label: 'Media — Image',
      description: 'Responsive image. Pass a path relative to /src/assets/ or a public URL.',
      schema: {
        src: fields.text({ label: 'Image path', validation: { isRequired: true } }),
        alt: fields.text({ label: 'Alt text', validation: { isRequired: true } }),
        description: fields.text({
          label: 'Caption / description / credit (optional)',
          description: 'Shown as a gradient strip at the bottom of the image, and beneath the enlarged image when clicked. Use it for any combination of caption and photographer credit.',
          multiline: true,
        }),
        displayInMedia: fields.checkbox({
          label: 'Show on the Media page',
          description: 'When the surrounding post (event or project) appears on /media, this image is also pulled into that post\'s accordion. Turn off to keep this body image post-only.',
          defaultValue: true,
        }),
        width: fields.text({ label: 'Width (CSS, default 100%)', defaultValue: '100%' }),
        class: fields.text({
          label: 'Extra classes (optional)',
          description: 'Tailwind classes appended to the image (e.g. "rounded-lg").',
        }),
        enableClickToEnlarge: fields.checkbox({
          label: 'Click to enlarge',
          description: 'When on, clicking the image opens a full-resolution modal.',
          defaultValue: true,
        }),
      },
      ContentView: ({ value }) => (
        <div style={box}>
          <div style={label}>Image</div>
          <NotEditable>
            <code style={{ fontSize: 12 }}>{value.src || '(no src)'}</code>
            <div style={{ opacity: 0.7, fontSize: 12 }}>{value.alt}</div>
            {value.description && (
              <div style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>{value.description}</div>
            )}
          </NotEditable>
        </div>
      ),
    });
  }

  return block({
    label: 'Media — Image',
    description: "Upload an image — it's saved into this entry's own asset folder.",
    schema: {
      src: fields.image({
        label: 'Image',
        directory: imageRoot,
        // Keystatic's getSrcPrefix(publicPath, slug) stores the full path in
        // the MDX (e.g. `/src/assets/events/<slug>/foo.jpg`), which Img.astro
        // resolves against the `allAssetImages` glob.
        publicPath: `/${imageRoot}/`,
        validation: { isRequired: true },
        description:
          'Large images (>2 MB) freeze the tab during upload — pre-resize with squoosh.app first.',
      }),
      alt: fields.text({ label: 'Alt text', validation: { isRequired: true } }),
      description: fields.text({
        label: 'Caption / description / credit (optional)',
        description: 'Shown as a gradient strip at the bottom of the image, and beneath the enlarged image when clicked. Use it for any combination of caption and photographer credit.',
        multiline: true,
      }),
      displayInMedia: fields.checkbox({
        label: 'Show on the Media page',
        description: 'When the surrounding post (event or project) appears on /media, this image is also pulled into that post\'s accordion. Turn off to keep this body image post-only.',
        defaultValue: true,
      }),
      width: fields.text({ label: 'Width (CSS, default 100%)', defaultValue: '100%' }),
      class: fields.text({
        label: 'Extra classes (optional)',
        description: 'Tailwind classes appended to the image (e.g. "rounded-lg").',
      }),
      enableClickToEnlarge: fields.checkbox({
        label: 'Click to enlarge',
        description: 'When on, clicking the image opens a full-resolution modal.',
        defaultValue: true,
      }),
    },
    ContentView: ({ value }) => {
      // fields.image form state is { data, extension, filename } during
      // upload; the persisted reader value is the string path.
      const displaySrc =
        typeof value.src === 'string'
          ? value.src
          : value.src?.filename
            ? `${value.src.filename} (uploading)`
            : '(no src)';
      return (
        <div style={box}>
          <div style={label}>Image</div>
          <NotEditable>
            <code style={{ fontSize: 12 }}>{displaySrc}</code>
            <div style={{ opacity: 0.7, fontSize: 12 }}>{value.alt}</div>
            {value.description && (
              <div style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>{value.description}</div>
            )}
          </NotEditable>
        </div>
      );
    },
  });
}

function makeImageGridBlock(imageRoot?: string) {
  const imageField = imageRoot
    ? fields.image({
        label: 'Image',
        directory: imageRoot,
        publicPath: `/${imageRoot}/`,
        validation: { isRequired: true },
        description:
          'Large images (>2 MB) freeze the tab during upload — pre-resize with squoosh.app first.',
      })
    : fields.text({ label: 'Image path', validation: { isRequired: true } });

  return block({
    label: 'Media — Image grid',
    description:
      'Responsive grid of images. Choose number of columns and whether tiles are cropped to squares or keep their native aspect ratio.',
    schema: {
      images: fields.array(
        fields.object({
          image: imageField,
          alt: fields.text({ label: 'Alt text', validation: { isRequired: true } }),
        }),
        {
          label: 'Images',
          itemLabel: (p) => {
            const img = p.fields.image.value as unknown;
            const imgLabel =
              typeof img === 'string'
                ? img
                : img && typeof img === 'object' && 'filename' in img
                  ? ((img as { filename?: string }).filename ?? '')
                  : '';
            return p.fields.alt.value || imgLabel || 'Image';
          },
        },
      ),
      cols: fields.integer({
        label: 'Columns (desktop)',
        description: 'Number of columns on desktop. Supported: 2–6.',
        defaultValue: 4,
      }),
      gap: fields.select({
        label: 'Gap',
        options: [
          { label: 'Small', value: 'sm' },
          { label: 'Medium', value: 'md' },
          { label: 'Large', value: 'lg' },
        ],
        defaultValue: 'md',
      }),
      aspectRatio: fields.select({
        label: 'Aspect ratio',
        description: '"Square" crops to 1:1 tiles. "Native" uses a masonry column layout.',
        options: [
          { label: 'Square', value: 'square' },
          { label: 'Native', value: 'native' },
        ],
        defaultValue: 'square',
      }),
      enableClickToEnlarge: fields.checkbox({
        label: 'Click to enlarge',
        defaultValue: true,
      }),
      class: fields.text({
        label: 'Extra classes (optional)',
      }),
    },
    ContentView: ({ value }) => (
      <div style={box}>
        <div style={label}>
          Image grid — {value.cols} cols · {value.aspectRatio}
        </div>
        <NotEditable>
          <span>
            {value.images.length} image{value.images.length === 1 ? '' : 's'}
          </span>
        </NotEditable>
      </div>
    ),
  });
}

// ============================================================================
// COMPONENT REGISTRY
// ============================================================================

type MdxComponentsOptions = {
  /**
   * Collection asset root (e.g. `src/assets/events`). When set, the Img
   * and ImageGrid blocks offer an upload widget that writes into
   * `<imageRoot>/<slug>/`. Omit to keep the legacy text-based variants.
   */
  imageRoot?: string;
  /**
   * Whether to expose the Preview block in the editor's insert menu.
   * Preview is only meaningful inside docs pages (it renders components
   * without prose styling for side-by-side code-example displays), so we
   * keep it hidden everywhere else to reduce noise for content editors.
   */
  includePreview?: boolean;
};

const sharedBlocks = {
  Accordion: block({
    label: 'Content — Accordion',
    description:
      'Collapsible FAQ-style sections. Each item has a title, optional subtitle, and Markdown content.',
    schema: {
      mode: fields.select({
        label: 'Display mode',
        description:
          'Pick how items open/close. A short description of the chosen mode shows in the block preview after you click Done.',
        options: [
          { label: 'Single — start closed', value: 'single-closed' },
          { label: 'Single — first open', value: 'single-open' },
          { label: 'Always one open', value: 'always-one' },
          { label: 'Multiple', value: 'multi' },
        ],
        defaultValue: 'single-closed',
      }),
      items: fields.array(
        fields.object({
          title: fields.text({ label: 'Title', validation: { isRequired: true } }),
          subtitle: fields.text({ label: 'Subtitle (optional)' }),
          content: fields.text({
            label: 'Content (Markdown)',
            multiline: true,
            validation: { isRequired: true },
          }),
        }),
        {
          label: 'Items',
          itemLabel: (p) => p.fields.title.value || 'Untitled',
        },
      ),
      width: fields.text({ label: 'Width (CSS)', defaultValue: '100%' }),
    },
    ContentView: ({ value }) => {
      const MODE_DESCRIPTIONS: Record<string, string> = {
        'single-closed': 'Only one open at a time. Click to open, click again to close. Starts with all closed.',
        'single-open': 'Only one open at a time. First item starts expanded. Click another to switch, click the open one to close.',
        'always-one': 'First item starts expanded and cannot be closed. Clicking another item switches which one is open.',
        'multi': 'Any number of items can be open at once. Each item toggles independently.',
      };
      const MODE_LABELS: Record<string, string> = {
        'single-closed': 'Single — start closed',
        'single-open': 'Single — first open',
        'always-one': 'Always one open',
        'multi': 'Multiple',
      };
      const modeLabel = MODE_LABELS[value.mode] ?? value.mode;
      const modeDescription = MODE_DESCRIPTIONS[value.mode] ?? '';
      const firstOpenIndex =
        value.mode === 'single-open' || value.mode === 'always-one' ? 0 : -1;
      return (
        <div style={box}>
          <div style={label}>Accordion — {modeLabel}</div>
          <NotEditable>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
              {modeDescription}
            </div>
            {value.items.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.6, fontStyle: 'italic' }}>
                No items yet — click Edit to add some.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  borderRadius: 4,
                  overflow: 'hidden',
                  border: '1px solid color-mix(in srgb, currentColor 15%, transparent)',
                }}
              >
                {value.items.map((item, i) => {
                  const isOpen = i === firstOpenIndex;
                  return (
                    <div
                      key={i}
                      style={{
                        padding: '0.4rem 0.6rem',
                        background: isOpen
                          ? 'color-mix(in srgb, currentColor 8%, transparent)'
                          : 'transparent',
                        borderBottom:
                          i < value.items.length - 1
                            ? '1px solid color-mix(in srgb, currentColor 10%, transparent)'
                            : 'none',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          gap: '0.5rem',
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 13 }}>
                          {item.title || <em style={{ opacity: 0.5 }}>Untitled</em>}
                        </span>
                        {item.subtitle ? (
                          <span style={{ fontSize: 11, opacity: 0.6 }}>
                            {item.subtitle}
                          </span>
                        ) : null}
                        <span style={{ fontSize: 10, opacity: 0.45, marginLeft: 'auto' }}>
                          {isOpen ? '▾ open' : '▸ closed'}
                        </span>
                      </div>
                      {isOpen && item.content ? (
                        <div
                          style={{
                            fontSize: 12,
                            opacity: 0.75,
                            marginTop: 4,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {item.content.length > 140
                            ? item.content.slice(0, 140) + '…'
                            : item.content}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </NotEditable>
        </div>
      );
    },
  }),

  AiPromptBlock: wrapper({
    label: 'Content — Collapsible code block',
    description:
      'Collapsible container with Copy and Expand/Collapse buttons, wrapping a code block. Originally built for the AI help guide.',
    schema: {
      label: fields.text({
        label: 'Header label',
        defaultValue: 'AI Context Prompt',
      }),
    },
    ContentView: ({ value, children }) => (
      <div style={box}>
        <div style={label}>{value.label || 'AI Context Prompt'}</div>
        <div>{children}</div>
      </div>
    ),
  }),

  Button: inline({
    label: 'Content — Button',
    description: 'A styled button or link.',
    schema: {
      href: fields.text({ label: 'Link (optional — renders <a> if set)' }),
      variant: fields.select({
        label: 'Color',
        options: [
          { label: 'Primary', value: 'primary' },
          { label: 'Secondary', value: 'secondary' },
          { label: 'Inverse', value: 'inverse' },
        ],
        defaultValue: 'primary',
      }),
      size: fields.select({
        label: 'Size',
        options: [
          { label: 'Standard', value: 'standard' },
          { label: 'Large', value: 'large' },
          { label: 'Extra large', value: 'xlarge' },
        ],
        defaultValue: 'standard',
      }),
      disabled: fields.checkbox({
        label: 'Disabled',
        description: 'Renders the button greyed-out and non-interactive.',
        defaultValue: false,
      }),
      content: fields.text({ label: 'Button text', validation: { isRequired: true } }),
    },
    NodeView: ({ value }) => {
      const variant = value.variant || 'primary';
      const size = value.size || 'standard';
      const variantStyle: React.CSSProperties =
        variant === 'secondary'
          ? {
              background: 'transparent',
              color: 'inherit',
              border: '2px solid #C50E1F',
            }
          : variant === 'inverse'
            ? {
                background: 'linear-gradient(to bottom, #303030, #2B2B2B)',
                color: '#E1E1E1',
                border: '2px solid transparent',
              }
            : {
                background: '#C50E1F',
                color: '#E1E1E1',
                border: '2px solid transparent',
              };
      const sizeStyle: React.CSSProperties =
        size === 'xlarge'
          ? { padding: '0.6rem 1.5rem', fontSize: 18 }
          : size === 'large'
            ? { padding: '0.4rem 1.2rem', fontSize: 15 }
            : { padding: '0.25rem 0.9rem', fontSize: 13 };
      return (
        <NotEditable>
          <span
            style={{
              display: 'inline-block',
              borderRadius: 999,
              fontWeight: 500,
              ...variantStyle,
              ...sizeStyle,
              ...(value.disabled ? { opacity: 0.4, filter: 'grayscale(1)' } : null),
            }}
          >
            {value.content || 'Button'}
          </span>
        </NotEditable>
      );
    },
  }),

  Callout: wrapper({
    label: 'Content — Callout',
    description: 'Highlighted content block with an optional title.',
    schema: {
      title: fields.text({ label: 'Title (optional)' }),
    },
    ContentView: ({ value, children }) => (
      <div
        style={{
          ...box,
          background: 'color-mix(in srgb, #4d88ff 12%, transparent)',
          borderStyle: 'solid',
          borderColor: 'color-mix(in srgb, #4d88ff 50%, transparent)',
        }}
      >
        <div style={label}>Callout</div>
        {value.title ? (
          <NotEditable>
            <strong>{value.title}</strong>
          </NotEditable>
        ) : null}
        <div>{children}</div>
      </div>
    ),
  }),

  Carousel: wrapper({
    label: 'Media — Carousel',
    description:
      'Slideshow with arrows, dots, and optional auto-scroll. Insert Img (or other) components as children — each direct child becomes a slide.',
    schema: {
      height: fields.select({
        label: 'Height',
        options: [
          { label: 'Small', value: 'sm' },
          { label: 'Medium', value: 'md' },
          { label: 'Large', value: 'lg' },
          { label: 'Extra large', value: 'xl' },
          { label: 'Auto', value: 'auto' },
        ],
        defaultValue: 'md',
      }),
      autoScroll: fields.checkbox({ label: 'Auto-scroll', defaultValue: false }),
      autoScrollInterval: fields.integer({ label: 'Auto-scroll interval (ms)', defaultValue: 5000 }),
      showArrows: fields.checkbox({ label: 'Show arrow buttons', defaultValue: true }),
      showDots: fields.checkbox({ label: 'Show dot indicators', defaultValue: true }),
    },
    ContentView: ({ value, children }) => (
      <div style={box}>
        <div style={label}>
          Carousel — height: {value.height}
          {value.autoScroll ? ` · auto-scroll ${value.autoScrollInterval}ms` : ''}
        </div>
        <div>{children}</div>
      </div>
    ),
  }),

  Center: wrapper({
    label: 'Layout — Center',
    description: 'Centers its children horizontally.',
    schema: {},
    ContentView: ({ children }) => (
      <div style={{ ...box, textAlign: 'center' }}>
        <div style={label}>Center</div>
        <div>{children}</div>
      </div>
    ),
  }),

  Instagram: block({
    label: 'Media — Instagram embed',
    description: 'Embeds an Instagram post by URL.',
    schema: {
      url: fields.text({
        label: 'Instagram post URL',
        description: 'Full URL (https://www.instagram.com/p/…) or just the shortcode.',
        validation: { isRequired: true },
      }),
      size: fields.select({
        label: 'Size',
        description: 'Max width of the embed card on desktop.',
        options: [
          { label: 'Small (380px)', value: 'small' },
          { label: 'Medium (460px)', value: 'medium' },
          { label: 'Large (540px)', value: 'large' },
          { label: 'Full width (100%)', value: 'full' },
        ],
        defaultValue: 'medium',
      }),
    },
    ContentView: ({ value }) => (
      <div style={box}>
        <div style={label}>Instagram — {value.size}</div>
        <NotEditable>
          <code style={{ fontSize: 12 }}>{value.url || '(no url)'}</code>
        </NotEditable>
      </div>
    ),
  }),

  Marquee: wrapper({
    label: 'Media — Marquee',
    description:
      'Horizontally scrolling row of content. Insert Img (or other) components as children — each direct child becomes a marquee item.',
    schema: {
      height: fields.select({
        label: 'Height',
        description: 'Vertical size of the marquee strip.',
        options: [
          { label: 'Small (12rem)', value: 'sm' },
          { label: 'Medium (16rem)', value: 'md' },
          { label: 'Large (20rem)', value: 'lg' },
          { label: 'Extra large (24rem)', value: 'xl' },
        ],
        defaultValue: 'md',
      }),
      direction: fields.select({
        label: 'Scroll direction',
        options: [
          { label: 'Left ← (default)', value: 'left' },
          { label: 'Right →', value: 'right' },
        ],
        defaultValue: 'left',
      }),
      speed: fields.integer({
        label: 'Speed (pixels per second)',
        description: 'Higher = faster scroll. Default 50.',
        defaultValue: 50,
      }),
      gap: fields.text({
        label: 'Gap between items',
        description: 'Any valid CSS length (e.g. 1rem, 24px). Default 2rem.',
        defaultValue: '2rem',
      }),
      pauseOnHover: fields.checkbox({
        label: 'Pause on hover',
        description: 'Desktop only — hovering the strip stops the scroll.',
        defaultValue: true,
      }),
    },
    ContentView: ({ value, children }) => (
      <div style={box}>
        <div style={label}>
          Marquee — {value.height} | {value.direction === 'right' ? 'right →' : 'left ←'} | {value.speed}px/s
        </div>
        <div>{children}</div>
      </div>
    ),
  }),

  YouTube: block({
    label: 'Media — YouTube video',
    description: 'Embeds a YouTube video by ID or URL.',
    schema: {
      id: fields.text({ label: 'YouTube video ID or URL', validation: { isRequired: true } }),
      title: fields.text({ label: 'Title (accessibility)', defaultValue: 'YouTube video' }),
      width: fields.text({ label: 'Width (CSS)', defaultValue: '100%' }),
      start: fields.integer({
        label: 'Start time (seconds, optional)',
        description: 'If set, the video starts playback at this many seconds in.',
      }),
      class: fields.text({
        label: 'Extra classes (optional)',
        description: 'Tailwind classes appended to the outer container.',
      }),
    },
    ContentView: ({ value }) => (
      <div style={box}>
        <div style={label}>YouTube</div>
        <NotEditable>
          <code style={{ fontSize: 12 }}>{value.id || '(no id)'}</code>
        </NotEditable>
      </div>
    ),
  }),

  SideBySide: repeating({
    label: 'Layout — Side-by-side',
    description: 'Two columns that stack on mobile. Insert one Left and one Right child.',
    children: ['Left', 'Right'],
    validation: { children: { min: 0, max: 2 } },
    schema: {
      showDivider: fields.checkbox({ label: 'Show divider', defaultValue: true }),
    },
    ContentView: ({ children }) => (
      <div style={box}>
        <div style={label}>Side-by-side</div>
        <div style={{ display: 'flex', gap: '1rem' }}>{children}</div>
      </div>
    ),
  }),

  Left: wrapper({
    label: 'Layout — Left column',
    description: 'Left column of a SideBySide layout.',
    forSpecificLocations: true,
    schema: {
      centerVertical: fields.checkbox({ label: 'Center vertically', defaultValue: false }),
    },
    ContentView: ({ children }) => (
      <div style={{ ...box, flex: 1 }}>
        <div style={label}>Left</div>
        <div>{children}</div>
      </div>
    ),
  }),

  Right: wrapper({
    label: 'Layout — Right column',
    description: 'Right column of a SideBySide layout.',
    forSpecificLocations: true,
    schema: {
      centerVertical: fields.checkbox({ label: 'Center vertically', defaultValue: false }),
    },
    ContentView: ({ children }) => (
      <div style={{ ...box, flex: 1 }}>
        <div style={label}>Right</div>
        <div>{children}</div>
      </div>
    ),
  }),
};

// Preview is docs-only — kept out of `sharedBlocks` so it doesn't clutter the
// insert menu for content editors working on events/projects/page-text. It's
// spliced back in by `buildMdxComponents` when `includePreview` is true.
const previewBlock = wrapper({
  label: 'Layout — Preview',
  description:
    'Live rendering of one or more components, without prose styling. Used in docs to show what a component looks like next to its code example.',
  schema: {
    layout: fields.select({
      label: 'Layout',
      options: [
        { label: 'Stack (default)', value: 'stack' },
        { label: 'Row', value: 'row' },
        { label: 'Row — center-aligned', value: 'row-center' },
      ],
      defaultValue: 'stack',
    }),
    spacing: fields.select({
      label: 'Spacing',
      options: [
        { label: 'Compact (mb-4)', value: 'compact' },
        { label: 'Normal (my-6)', value: 'normal' },
      ],
      defaultValue: 'compact',
    }),
  },
  ContentView: ({ children }) => (
    <div style={{ ...box, borderStyle: 'solid', opacity: 0.9 }}>
      <div style={label}>Preview</div>
      <div>{children}</div>
    </div>
  ),
});

export function buildMdxComponents(opts: MdxComponentsOptions = {}) {
  return {
    ...sharedBlocks,
    Img: makeImgBlock(opts.imageRoot),
    ImageGrid: makeImageGridBlock(opts.imageRoot),
    ...(opts.includePreview ? { Preview: previewBlock } : {}),
  };
}

// Back-compat default: text-based Img, same as before the factory landed.
export const mdxComponents = buildMdxComponents();

// Silence unused-import warning for `mark` — kept in the import list in case
// future components need it.
void mark;
