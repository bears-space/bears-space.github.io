import { getCollection } from 'astro:content';

// Social platforms are editor-driven: each entry in the `social-platforms`
// content collection owns a label, icon path, and optional default hover color.
// Runtime code loads them into a slug -> info map once per build and resolves
// `socialLinks[].platform` references against it.

export interface SocialPlatformInfo {
  slug: string;
  label: string;
  iconFile: string;
  defaultHoverColor?: string;
}

let cachedMap: Map<string, SocialPlatformInfo> | null = null;

export async function getSocialPlatformsMap(): Promise<Map<string, SocialPlatformInfo>> {
  if (cachedMap) return cachedMap;
  const entries = await getCollection('social-platforms');
  cachedMap = new Map(
    entries.map((entry) => [
      entry.id.replace(/\.mdx?$/i, ''),
      {
        slug: entry.id.replace(/\.mdx?$/i, ''),
        label: entry.data.label,
        iconFile: entry.data.iconFile,
        defaultHoverColor: entry.data.defaultHoverColor,
      },
    ]),
  );
  return cachedMap;
}
