import type { MockedFunction } from 'vitest';
import { getCollection, getEntry } from 'astro:content';
import {
  sortByDateDesc,
  sortBySlug,
  filterDrafts,
  getPublishedEvents,
  getPublishedProjects,
  getPublishedPosts,
  getLatestPosts,
  getPageContent,
  getDocsBySection,
  getLandingHeroSlides,
  getMeetTheTeamProjectsWithPeople,
  getFacesOfBearsPeople,
  getSponsorsByTier,
  getTestimonials,
  getPublishedInstagramPosts,
  getLatestInstagramPosts,
} from '../contentQueries';

// `astro:content` is aliased to a loose local mock at runtime (vitest.config.ts)
// but tsconfig resolves it to the real Astro types — so `vi.mocked(getCollection)`
// inherits the full `CollectionEntry` union, rejecting the minimal shapes
// `makeEntry` builds below. Re-typing relaxes the argument shape without
// affecting the rest of the test file.
const mockedGetCollection = vi.mocked(getCollection) as unknown as MockedFunction<
  (collection: string) => Promise<Array<Record<string, unknown>>>
>;
const mockedGetEntry = vi.mocked(getEntry) as unknown as MockedFunction<
  (collection: string, id: string) => Promise<Record<string, unknown> | undefined>
>;

// ---------------------------------------------------------------------------
// Helpers for creating mock entries
// ---------------------------------------------------------------------------

function makeEntry(overrides: { date?: Date; slug?: string; isDraft?: boolean; id?: string; displayMeetTheTeam?: boolean; order?: number }) {
  return {
    id: overrides.id ?? 'en/test.mdx',
    slug: overrides.slug ?? 'test',
    data: {
      date: overrides.date ?? new Date('2024-01-01'),
      isDraft: overrides.isDraft,
      displayMeetTheTeam: overrides.displayMeetTheTeam,
      order: overrides.order,
    },
  };
}

// ---------------------------------------------------------------------------
// sortByDateDesc
// ---------------------------------------------------------------------------

describe('sortByDateDesc', () => {
  it('sorts entries newest-first', () => {
    const entries = [
      makeEntry({ date: new Date('2023-01-01') }),
      makeEntry({ date: new Date('2024-06-15') }),
      makeEntry({ date: new Date('2023-07-01') }),
    ];
    const sorted = sortByDateDesc(entries);
    expect(sorted[0].data.date).toEqual(new Date('2024-06-15'));
    expect(sorted[1].data.date).toEqual(new Date('2023-07-01'));
    expect(sorted[2].data.date).toEqual(new Date('2023-01-01'));
  });

  it('does not mutate the original array', () => {
    const entries = [
      makeEntry({ date: new Date('2023-01-01') }),
      makeEntry({ date: new Date('2024-01-01') }),
    ];
    const original = [...entries];
    sortByDateDesc(entries);
    expect(entries).toEqual(original);
  });

  it('returns empty array for empty input', () => {
    expect(sortByDateDesc([])).toEqual([]);
  });

  it('returns same entry for single-element input', () => {
    const entry = makeEntry({ date: new Date('2024-01-01') });
    const result = sortByDateDesc([entry]);
    expect(result).toHaveLength(1);
    expect(result[0].data.date).toEqual(new Date('2024-01-01'));
  });

  it('handles dates across different years', () => {
    const entries = [
      makeEntry({ date: new Date('2020-12-31') }),
      makeEntry({ date: new Date('2025-01-01') }),
      makeEntry({ date: new Date('2022-06-15') }),
    ];
    const sorted = sortByDateDesc(entries);
    expect(sorted.map(e => e.data.date.getFullYear())).toEqual([2025, 2022, 2020]);
  });

  it('handles dates within the same day', () => {
    const entries = [
      makeEntry({ date: new Date('2024-01-01T08:00:00') }),
      makeEntry({ date: new Date('2024-01-01T20:00:00') }),
      makeEntry({ date: new Date('2024-01-01T12:00:00') }),
    ];
    const sorted = sortByDateDesc(entries);
    expect(sorted[0].data.date.getHours()).toBe(20);
    expect(sorted[1].data.date.getHours()).toBe(12);
    expect(sorted[2].data.date.getHours()).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// sortBySlug
// ---------------------------------------------------------------------------

describe('sortBySlug', () => {
  it('sorts alphabetically ascending', () => {
    const entries = [
      makeEntry({ slug: 'charlie' }),
      makeEntry({ slug: 'alpha' }),
      makeEntry({ slug: 'bravo' }),
    ];
    const sorted = sortBySlug(entries);
    expect(sorted.map(e => e.slug)).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('does not mutate the original array', () => {
    const entries = [
      makeEntry({ slug: 'b' }),
      makeEntry({ slug: 'a' }),
    ];
    const original = [...entries];
    sortBySlug(entries);
    expect(entries).toEqual(original);
  });

  it('returns empty array for empty input', () => {
    expect(sortBySlug([])).toEqual([]);
  });

  it('returns same entry for single-element input', () => {
    const entry = makeEntry({ slug: 'only' });
    expect(sortBySlug([entry])).toHaveLength(1);
  });

  it('sorts numeric-prefix slugs correctly', () => {
    const entries = [
      makeEntry({ slug: '02-bar' }),
      makeEntry({ slug: '01-foo' }),
      makeEntry({ slug: '10-baz' }),
    ];
    const sorted = sortBySlug(entries);
    expect(sorted.map(e => e.slug)).toEqual(['01-foo', '02-bar', '10-baz']);
  });

  it('handles identical slugs', () => {
    const entries = [
      makeEntry({ slug: 'same' }),
      makeEntry({ slug: 'same' }),
    ];
    const sorted = sortBySlug(entries);
    expect(sorted).toHaveLength(2);
    expect(sorted.every(e => e.slug === 'same')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filterDrafts
// ---------------------------------------------------------------------------

describe('filterDrafts', () => {
  describe('production mode (DEV=false)', () => {
    beforeEach(() => {
      import.meta.env.DEV = false;
    });

    it('filters out entries with isDraft: true', () => {
      const entries = [
        makeEntry({ isDraft: true }),
        makeEntry({ isDraft: false }),
      ];
      const result = filterDrafts(entries);
      expect(result).toHaveLength(1);
      expect(result[0].data.isDraft).toBe(false);
    });

    it('keeps entries with isDraft: false', () => {
      const entries = [makeEntry({ isDraft: false })];
      expect(filterDrafts(entries)).toHaveLength(1);
    });

    it('keeps entries with isDraft: undefined', () => {
      const entries = [makeEntry({})];
      expect(filterDrafts(entries)).toHaveLength(1);
    });

    it('returns empty array for empty input', () => {
      expect(filterDrafts([])).toEqual([]);
    });

    it('returns empty array when all entries are drafts', () => {
      const entries = [
        makeEntry({ isDraft: true }),
        makeEntry({ isDraft: true }),
      ];
      expect(filterDrafts(entries)).toHaveLength(0);
    });

    it('filters mixed draft/non-draft entries correctly', () => {
      const entries = [
        makeEntry({ isDraft: false, slug: 'a' }),
        makeEntry({ isDraft: true, slug: 'b' }),
        makeEntry({ isDraft: false, slug: 'c' }),
        makeEntry({ isDraft: true, slug: 'd' }),
      ];
      const result = filterDrafts(entries);
      expect(result).toHaveLength(2);
      expect(result.map(e => e.slug)).toEqual(['a', 'c']);
    });

    it('does not mutate the original array', () => {
      const entries = [
        makeEntry({ isDraft: true }),
        makeEntry({ isDraft: false }),
      ];
      const original = [...entries];
      filterDrafts(entries);
      expect(entries).toEqual(original);
    });
  });

  describe('development mode (DEV=true)', () => {
    beforeEach(() => {
      import.meta.env.DEV = true;
    });

    it('returns all entries including drafts', () => {
      const entries = [
        makeEntry({ isDraft: true }),
        makeEntry({ isDraft: false }),
        makeEntry({}),
      ];
      expect(filterDrafts(entries)).toHaveLength(3);
    });
  });
});

// ---------------------------------------------------------------------------
// Async query functions (require getCollection mock)
// ---------------------------------------------------------------------------

describe('getPublishedEvents', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
    import.meta.env.DEV = false;
  });

  it('returns events sorted by date descending', async () => {
    mockedGetCollection.mockResolvedValue([
      makeEntry({ id: 'en/old.mdx', date: new Date('2023-01-01'), slug: 'old' }),
      makeEntry({ id: 'en/new.mdx', date: new Date('2024-06-01'), slug: 'new' }),
    ]);
    const result = await getPublishedEvents();
    expect(result[0].slug).toBe('new');
    expect(result[1].slug).toBe('old');
  });

  it('calls getCollection with "events"', async () => {
    mockedGetCollection.mockResolvedValue([]);
    await getPublishedEvents();
    expect(mockedGetCollection).toHaveBeenCalledWith('events');
  });
});

describe('getPublishedProjects', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
    import.meta.env.DEV = false;
  });

  it('returns projects sorted by date descending', async () => {
    mockedGetCollection.mockResolvedValue([
      makeEntry({ id: 'en/older.mdx', date: new Date('2022-03-01'), slug: 'older' }),
      makeEntry({ id: 'en/newer.mdx', date: new Date('2024-09-01'), slug: 'newer' }),
    ]);
    const result = await getPublishedProjects();
    expect(result[0].slug).toBe('newer');
  });

  it('calls getCollection with "projects"', async () => {
    mockedGetCollection.mockResolvedValue([]);
    await getPublishedProjects();
    expect(mockedGetCollection).toHaveBeenCalledWith('projects');
  });
});

describe('getPublishedPosts', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
    import.meta.env.DEV = false;
  });

  it('merges events and projects sorted by date', async () => {
    // First call returns events, second returns projects
    mockedGetCollection
      .mockResolvedValueOnce([
        makeEntry({ id: 'en/event-1.mdx', date: new Date('2024-01-01'), slug: 'event-1' }),
      ])
      .mockResolvedValueOnce([
        makeEntry({ id: 'en/project-1.mdx', date: new Date('2024-06-01'), slug: 'project-1' }),
      ]);

    const result = await getPublishedPosts();
    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe('project-1'); // newer
    expect(result[1].slug).toBe('event-1');   // older
  });

  it('adds _collectionType markers', async () => {
    mockedGetCollection
      .mockResolvedValueOnce([makeEntry({ id: 'en/e1.mdx', slug: 'e1' })])
      .mockResolvedValueOnce([makeEntry({ id: 'en/p1.mdx', slug: 'p1' })]);

    const result = await getPublishedPosts();
    const event = result.find(p => p.slug === 'e1');
    const project = result.find(p => p.slug === 'p1');
    expect(event).toHaveProperty('_collectionType', 'events');
    expect(project).toHaveProperty('_collectionType', 'projects');
  });

  it('returns empty array when no content exists', async () => {
    mockedGetCollection.mockResolvedValue([]);
    const result = await getPublishedPosts();
    expect(result).toEqual([]);
  });
});

describe('getLatestPosts', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
    import.meta.env.DEV = false;
  });

  it('returns at most N posts', async () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: `en/post-${i}.mdx`, date: new Date(`2024-${String(i + 1).padStart(2, '0')}-01`), slug: `post-${i}` })
    );
    mockedGetCollection.mockResolvedValue(entries);

    const result = await getLatestPosts(3);
    expect(result).toHaveLength(3);
  });

  it('defaults to 4 posts', async () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: `en/post-${i}.mdx`, date: new Date(`2024-${String(i + 1).padStart(2, '0')}-01`), slug: `post-${i}` })
    );
    mockedGetCollection.mockResolvedValue(entries);

    const result = await getLatestPosts();
    expect(result).toHaveLength(4);
  });
});

describe('getPageContent', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
  });

  it('finds entry by id', async () => {
    mockedGetCollection.mockResolvedValue([
      { id: 'en/landing/hero.mdx', slug: 'hero', data: { title: 'Hero' } },
      { id: 'en/sub-pages/about.mdx', slug: 'about', data: { title: 'About' } },
    ]);
    const result = await getPageContent('landing/hero');
    expect(result?.data.title).toBe('Hero');
  });

  it('appends .md extension if missing', async () => {
    mockedGetCollection.mockResolvedValue([
      { id: 'en/landing/hero.mdx', slug: 'hero', data: { title: 'Hero' } },
    ]);
    const result = await getPageContent('landing/hero');
    expect(result).toBeDefined();
  });

  it('does not double-append .mdx', async () => {
    mockedGetCollection.mockResolvedValue([
      { id: 'en/landing/hero.mdx', slug: 'hero', data: { title: 'Hero' } },
    ]);
    const result = await getPageContent('landing/hero.mdx');
    expect(result).toBeDefined();
  });

  it('finds entries whose loader-generated ids omit the file extension', async () => {
    mockedGetCollection.mockResolvedValue([
      { id: 'en/landing/hero', data: { title: 'Hero' } },
    ]);
    const result = await getPageContent('landing/hero');
    expect(result?.data.title).toBe('Hero');
  });

  it('returns undefined for non-existent id', async () => {
    mockedGetCollection.mockResolvedValue([
      { id: 'en/landing/hero.mdx', slug: 'hero', data: { title: 'Hero' } },
    ]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await getPageContent('does-not-exist');
    expect(result).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('warns when id is not found', async () => {
    mockedGetCollection.mockResolvedValue([]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await getPageContent('nonexistent/page');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent/page')
    );
    warnSpy.mockRestore();
  });
});

describe('getLandingHeroSlides', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
  });

  it('sorts slides by data.order ascending', async () => {
    mockedGetCollection.mockResolvedValue([
      { id: 'c.mdx', slug: 'c', data: { order: 3 } },
      { id: 'a.mdx', slug: 'a', data: { order: 1 } },
      { id: 'b.mdx', slug: 'b', data: { order: 2 } },
    ]);
    const result = await getLandingHeroSlides();
    expect(result.map(s => s.id)).toEqual(['a.mdx', 'b.mdx', 'c.mdx']);
  });

  it('sorts numerically across non-contiguous orders', async () => {
    mockedGetCollection.mockResolvedValue([
      { id: 'ten.mdx', slug: 'ten', data: { order: 10 } },
      { id: 'two.mdx', slug: 'two', data: { order: 2 } },
      { id: 'one.mdx', slug: 'one', data: { order: 1 } },
    ]);
    const result = await getLandingHeroSlides();
    expect(result.map(s => s.id)).toEqual(['one.mdx', 'two.mdx', 'ten.mdx']);
  });

  it('breaks ties on filename for deterministic output', async () => {
    mockedGetCollection.mockResolvedValue([
      { id: 'beta.mdx', slug: 'beta', data: { order: 1 } },
      { id: 'alpha.mdx', slug: 'alpha', data: { order: 1 } },
    ]);
    const result = await getLandingHeroSlides();
    expect(result.map(s => s.id)).toEqual(['alpha.mdx', 'beta.mdx']);
  });

  it('returns empty array for empty collection', async () => {
    mockedGetCollection.mockResolvedValue([]);
    const result = await getLandingHeroSlides();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getMeetTheTeamProjectsWithPeople
// ---------------------------------------------------------------------------

function makePerson(overrides: {
  slug: string;
  name?: string;
  roleEn?: string;
  roleDe?: string;
  coverImage?: string;
  showInFaces?: boolean;
  order?: number;
}) {
  return {
    id: `${overrides.slug}.mdx`,
    slug: overrides.slug,
    collection: 'people',
    data: {
      name: overrides.name ?? overrides.slug,
      roleEn: overrides.roleEn ?? 'Project Lead',
      roleDe: overrides.roleDe ?? 'Projektleitung',
      coverImage: overrides.coverImage ?? `${overrides.slug}/coverImage.jpg`,
      showInFaces: overrides.showInFaces ?? false,
      order: overrides.order ?? 0,
    },
  };
}

function makeTestimonialItem(overrides: {
  person: string;
  quoteEn?: string;
  quoteDe?: string;
}) {
  return {
    person: overrides.person,
    quoteEn: overrides.quoteEn ?? 'quote',
    quoteDe: overrides.quoteDe ?? 'zitat',
  };
}

function makeTestimonialsList(items: ReturnType<typeof makeTestimonialItem>[]) {
  return {
    id: 'list',
    collection: 'testimonials',
    data: { items },
  };
}

describe('getMeetTheTeamProjectsWithPeople', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
    import.meta.env.DEV = false;
  });

  function withCollections(projects: unknown[], people: unknown[]) {
    mockedGetCollection.mockImplementation(async (name: string) => {
      if (name === 'projects') return projects as Array<Record<string, unknown>>;
      if (name === 'people') return people as Array<Record<string, unknown>>;
      return [];
    });
  }

  it('queries both projects and people collections', async () => {
    withCollections([], []);
    await getMeetTheTeamProjectsWithPeople();
    expect(mockedGetCollection).toHaveBeenCalledWith('projects');
    expect(mockedGetCollection).toHaveBeenCalledWith('people');
  });

  it('attaches the resolved person and locale-correct displayRole', async () => {
    withCollections(
      [{ ...makeEntry({ id: 'en/p.mdx', slug: 'p', displayMeetTheTeam: true }), data: { ...makeEntry({ id: 'en/p.mdx', slug: 'p', displayMeetTheTeam: true }).data, person: 'jane' } }],
      [makePerson({ slug: 'jane', name: 'Jane Doe', roleEn: 'CEO', roleDe: 'Geschäftsführerin' })],
    );
    const result = await getMeetTheTeamProjectsWithPeople('de');
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe('Jane Doe');
    expect(result[0].displayRole).toBe('Geschäftsführerin');
    expect(result[0].person.slug).toBe('jane');
  });

  it('sorts attached entries by project date descending', async () => {
    withCollections(
      [
        { ...makeEntry({ id: 'en/old.mdx', slug: 'old', date: new Date('2023-01-01'), displayMeetTheTeam: true }), data: { ...makeEntry({ id: 'en/old.mdx', slug: 'old', date: new Date('2023-01-01'), displayMeetTheTeam: true }).data, person: 'a' } },
        { ...makeEntry({ id: 'en/new.mdx', slug: 'new', date: new Date('2024-06-01'), displayMeetTheTeam: true }), data: { ...makeEntry({ id: 'en/new.mdx', slug: 'new', date: new Date('2024-06-01'), displayMeetTheTeam: true }).data, person: 'b' } },
      ],
      [makePerson({ slug: 'a' }), makePerson({ slug: 'b' })],
    );
    const result = await getMeetTheTeamProjectsWithPeople();
    expect(result[0].project.slug).toBe('new');
    expect(result[1].project.slug).toBe('old');
  });

  it('filters out projects without displayMeetTheTeam', async () => {
    withCollections(
      [
        { ...makeEntry({ id: 'en/yes.mdx', slug: 'yes', displayMeetTheTeam: true }), data: { ...makeEntry({ id: 'en/yes.mdx', slug: 'yes', displayMeetTheTeam: true }).data, person: 'a' } },
        makeEntry({ id: 'en/no.mdx', slug: 'no' }),
      ],
      [makePerson({ slug: 'a' })],
    );
    const result = await getMeetTheTeamProjectsWithPeople();
    expect(result).toHaveLength(1);
    expect(result[0].project.slug).toBe('yes');
  });

  it('skips and warns on projects whose person reference does not resolve', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    withCollections(
      [{ ...makeEntry({ id: 'en/orphan.mdx', slug: 'orphan', displayMeetTheTeam: true }), data: { ...makeEntry({ id: 'en/orphan.mdx', slug: 'orphan', displayMeetTheTeam: true }).data, person: 'ghost' } }],
      [],
    );
    const result = await getMeetTheTeamProjectsWithPeople();
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ghost'));
    warnSpy.mockRestore();
  });

  it('returns an empty array when no projects exist', async () => {
    withCollections([], []);
    const result = await getMeetTheTeamProjectsWithPeople();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getFacesOfBearsPeople
// ---------------------------------------------------------------------------

describe('getFacesOfBearsPeople', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
  });

  it('returns only people flagged showInFaces, sorted by order then slug', async () => {
    mockedGetCollection.mockResolvedValue([
      makePerson({ slug: 'b', showInFaces: true, order: 5 }),
      makePerson({ slug: 'a', showInFaces: true, order: 5 }),
      makePerson({ slug: 'first', showInFaces: true, order: 1 }),
      makePerson({ slug: 'hidden', showInFaces: false, order: 0 }),
    ]);
    const result = await getFacesOfBearsPeople();
    expect(result.map((p) => p.slug)).toEqual(['first', 'a', 'b']);
  });

  it('projects role from the locale-appropriate field', async () => {
    mockedGetCollection.mockResolvedValue([
      makePerson({ slug: 'jane', showInFaces: true, roleEn: 'CEO', roleDe: 'Geschäftsführerin' }),
    ]);
    const en = await getFacesOfBearsPeople('en');
    const de = await getFacesOfBearsPeople('de');
    expect((en[0].data as { role: string }).role).toBe('CEO');
    expect((de[0].data as { role: string }).role).toBe('Geschäftsführerin');
  });
});

// ---------------------------------------------------------------------------
// getSponsorsByTier
// ---------------------------------------------------------------------------

function makeSponsor(overrides: { id: string; slug: string; order?: number }) {
  return {
    id: overrides.id,
    slug: overrides.slug,
    data: { name: overrides.slug, order: overrides.order ?? 0 },
    collection: 'sponsors',
  };
}

describe('getSponsorsByTier', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
  });

  it('groups sponsors by tier derived from id', async () => {
    mockedGetCollection.mockResolvedValue([
      makeSponsor({ id: 'gold/acme', slug: 'acme', order: 1 }),
      makeSponsor({ id: 'silver/beta', slug: 'beta', order: 1 }),
      makeSponsor({ id: 'gold/zeta', slug: 'zeta', order: 2 }),
      makeSponsor({ id: 'bronze/gamma', slug: 'gamma', order: 1 }),
    ]);

    const result = await getSponsorsByTier();
    expect(result.gold).toHaveLength(2);
    expect(result.silver).toHaveLength(1);
    expect(result.bronze).toHaveLength(1);
    expect(result.diamond).toHaveLength(0);
    expect(result.platinum).toHaveLength(0);
  });

  it('sorts each tier by data.order ascending', async () => {
    mockedGetCollection.mockResolvedValue([
      makeSponsor({ id: 'gold/zeta-corp', slug: 'zeta-corp', order: 3 }),
      makeSponsor({ id: 'gold/alpha-inc', slug: 'alpha-inc', order: 1 }),
      makeSponsor({ id: 'gold/mid-co', slug: 'mid-co', order: 2 }),
    ]);

    const result = await getSponsorsByTier();
    expect(result.gold.map(s => s.slug)).toEqual(['alpha-inc', 'mid-co', 'zeta-corp']);
  });

  it('breaks order ties on slug', async () => {
    mockedGetCollection.mockResolvedValue([
      makeSponsor({ id: 'silver/beta', slug: 'beta', order: 1 }),
      makeSponsor({ id: 'silver/alpha', slug: 'alpha', order: 1 }),
    ]);

    const result = await getSponsorsByTier();
    expect(result.silver.map(s => s.slug)).toEqual(['alpha', 'beta']);
  });

  it('returns all five tier keys', async () => {
    mockedGetCollection.mockResolvedValue([]);
    const result = await getSponsorsByTier();
    expect(Object.keys(result)).toEqual(['diamond', 'platinum', 'gold', 'silver', 'bronze']);
  });

  it('returns empty arrays for tiers with no sponsors', async () => {
    mockedGetCollection.mockResolvedValue([
      makeSponsor({ id: 'gold/only', slug: 'only' }),
    ]);
    const result = await getSponsorsByTier();
    expect(result.diamond).toEqual([]);
    expect(result.platinum).toEqual([]);
    expect(result.silver).toEqual([]);
    expect(result.bronze).toEqual([]);
  });

  it('calls getCollection with "sponsors"', async () => {
    mockedGetCollection.mockResolvedValue([]);
    await getSponsorsByTier();
    expect(mockedGetCollection).toHaveBeenCalledWith('sponsors');
  });

  it('skips sponsors with unknown tier prefix and warns', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockedGetCollection.mockResolvedValue([
      makeSponsor({ id: 'unknown/corp', slug: 'corp' }),
    ]);
    const result = await getSponsorsByTier();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown sponsor tier'));
    expect(result.diamond).toHaveLength(0);
    expect(result.platinum).toHaveLength(0);
    expect(result.gold).toHaveLength(0);
    expect(result.silver).toHaveLength(0);
    expect(result.bronze).toHaveLength(0);
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getTestimonials
// ---------------------------------------------------------------------------

describe('getTestimonials', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
    mockedGetEntry.mockReset();
  });

  function withList(items: ReturnType<typeof makeTestimonialItem>[], people: unknown[]) {
    mockedGetEntry.mockImplementation(async (name: string, id: string) => {
      if (name === 'testimonials' && id === 'list') return makeTestimonialsList(items);
      return undefined;
    });
    mockedGetCollection.mockImplementation(async (name: string) => {
      if (name === 'people') return people as Array<Record<string, unknown>>;
      return [];
    });
  }

  it('returns resolved people entries in array order (no sort)', async () => {
    withList(
      [
        makeTestimonialItem({ person: 'first' }),
        makeTestimonialItem({ person: 'b' }),
        makeTestimonialItem({ person: 'a' }),
      ],
      [makePerson({ slug: 'a' }), makePerson({ slug: 'b' }), makePerson({ slug: 'first' })],
    );
    const result = await getTestimonials();
    expect(result.map((p) => p.slug)).toEqual(['first', 'b', 'a']);
  });

  it('projects role from the person (locale-aware) and quote from the item (locale-aware)', async () => {
    withList(
      [makeTestimonialItem({ person: 'jane', quoteEn: 'Great place', quoteDe: 'Toller Ort' })],
      [makePerson({ slug: 'jane', roleEn: 'CEO', roleDe: 'Geschäftsführerin' })],
    );
    const en = await getTestimonials('en');
    const de = await getTestimonials('de');
    expect((en[0].data as { role: string; quote: string }).role).toBe('CEO');
    expect((en[0].data as { role: string; quote: string }).quote).toBe('Great place');
    expect((de[0].data as { role: string; quote: string }).role).toBe('Geschäftsführerin');
    expect((de[0].data as { role: string; quote: string }).quote).toBe('Toller Ort');
  });

  it('skips and warns on items whose person reference does not resolve', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    withList(
      [makeTestimonialItem({ person: 'ghost' })],
      [],
    );
    const result = await getTestimonials();
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ghost'));
    warnSpy.mockRestore();
  });

  it('returns empty array when the singleton entry is missing', async () => {
    mockedGetEntry.mockResolvedValue(undefined);
    mockedGetCollection.mockResolvedValue([]);
    const result = await getTestimonials();
    expect(result).toEqual([]);
  });

  it('reads the `list` entry from the testimonials collection and the people collection', async () => {
    withList([], []);
    await getTestimonials();
    expect(mockedGetEntry).toHaveBeenCalledWith('testimonials', 'list');
    expect(mockedGetCollection).toHaveBeenCalledWith('people');
  });
});

// ---------------------------------------------------------------------------
// getPublishedInstagramPosts
// ---------------------------------------------------------------------------

describe('getPublishedInstagramPosts', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
    import.meta.env.DEV = false;
  });

  it('returns instagram posts sorted by date descending', async () => {
    mockedGetCollection.mockResolvedValue([
      makeEntry({ date: new Date('2024-01-01'), slug: 'old-post' }),
      makeEntry({ date: new Date('2024-06-01'), slug: 'new-post' }),
    ]);
    const result = await getPublishedInstagramPosts();
    expect(result[0].slug).toBe('new-post');
    expect(result[1].slug).toBe('old-post');
  });

  it('calls getCollection with "instagram"', async () => {
    mockedGetCollection.mockResolvedValue([]);
    await getPublishedInstagramPosts();
    expect(mockedGetCollection).toHaveBeenCalledWith('instagram');
  });
});

// ---------------------------------------------------------------------------
// getLatestInstagramPosts
// ---------------------------------------------------------------------------

describe('getLatestInstagramPosts', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
    import.meta.env.DEV = false;
  });

  it('defaults to 3 posts', async () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ date: new Date(`2024-${String(i + 1).padStart(2, '0')}-01`), slug: `ig-${i}` })
    );
    mockedGetCollection.mockResolvedValue(entries);

    const result = await getLatestInstagramPosts();
    expect(result).toHaveLength(3);
  });

  it('respects custom limit', async () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ date: new Date(`2024-${String(i + 1).padStart(2, '0')}-01`), slug: `ig-${i}` })
    );
    mockedGetCollection.mockResolvedValue(entries);

    const result = await getLatestInstagramPosts(5);
    expect(result).toHaveLength(5);
  });

  it('returns all posts when fewer than limit', async () => {
    mockedGetCollection.mockResolvedValue([
      makeEntry({ date: new Date('2024-01-01'), slug: 'only' }),
    ]);

    const result = await getLatestInstagramPosts(3);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getPageContent — locale fallback
// ---------------------------------------------------------------------------

describe('getPageContent locale fallback', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
  });

  it('returns German entry when available', async () => {
    mockedGetCollection.mockResolvedValue([
      { id: 'en/landing/hero.mdx', slug: 'hero', data: { title: 'Hero EN' } },
      { id: 'de/landing/hero.mdx', slug: 'hero', data: { title: 'Hero DE' } },
    ]);
    const result = await getPageContent('landing/hero', 'de');
    expect(result?.data.title).toBe('Hero DE');
  });

  it('falls back to English when German entry is missing', async () => {
    mockedGetCollection.mockResolvedValue([
      { id: 'en/landing/hero.mdx', slug: 'hero', data: { title: 'Hero EN' } },
    ]);
    const result = await getPageContent('landing/hero', 'de');
    expect(result?.data.title).toBe('Hero EN');
  });

  it('does not fall back when locale is en (default)', async () => {
    mockedGetCollection.mockResolvedValue([
      { id: 'de/landing/hero.mdx', slug: 'hero', data: { title: 'Hero DE' } },
    ]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await getPageContent('landing/hero', 'en');
    expect(result).toBeUndefined();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getDocsBySection
// ---------------------------------------------------------------------------

describe('getDocsBySection', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
  });

  it('groups docs by section folder', async () => {
    mockedGetCollection.mockResolvedValue([
      { id: 'guides/getting-started.mdx', slug: 'getting-started', data: { title: 'Getting Started', order: 10 } },
      { id: 'guides/advanced.mdx', slug: 'advanced', data: { title: 'Advanced', order: 20 } },
      { id: 'dev/architecture.mdx', slug: 'architecture', data: { title: 'Architecture', order: 10 } },
    ]);

    const result = await getDocsBySection();
    expect(Object.keys(result)).toContain('guides');
    expect(Object.keys(result)).toContain('dev');
    expect(result.guides).toHaveLength(2);
    expect(result.dev).toHaveLength(1);
  });

  it('sorts docs within each section by order', async () => {
    mockedGetCollection.mockResolvedValue([
      { id: 'guides/z-last.mdx', slug: 'z-last', data: { title: 'Last', order: 30 } },
      { id: 'guides/a-first.mdx', slug: 'a-first', data: { title: 'First', order: 10 } },
      { id: 'guides/m-middle.mdx', slug: 'm-middle', data: { title: 'Middle', order: 20 } },
    ]);

    const result = await getDocsBySection();
    expect(result.guides.map(d => d.data.order)).toEqual([10, 20, 30]);
  });

  it('returns empty object for empty collection', async () => {
    mockedGetCollection.mockResolvedValue([]);
    const result = await getDocsBySection();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('calls getCollection with "docs"', async () => {
    mockedGetCollection.mockResolvedValue([]);
    await getDocsBySection();
    expect(mockedGetCollection).toHaveBeenCalledWith('docs');
  });
});
