import {
  IOContext,
  Logger,
  RequestConfig,
  Tenant,
  TenantClient,
} from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { Clients } from '../../clients'
import {
  CmsDataPlane,
  ContentEntry,
  DataPlaneListResponse,
  EntriesList,
  PublishedEntry,
} from '../../clients/cmsDataPlane'
import {
  cacheFileNameFor,
  CachedEntry,
  CONTENT_PLATFORM_CACHE_BUCKET,
} from '../../services/contentPlatformCache'
import {
  createMemoryVBaseMock,
  LoggerCapture,
  makeLogger,
} from '../../test/fixtures/cmsTestFixtures'
import {
  CONTENT_PLATFORM_ROUTES_PREFIX,
  getBucket,
  hashString,
} from '../../utils'
import { generateContentPlatformRoutes } from './generateContentPlatformRoutes'
import {
  CONTENT_PLATFORM_ROUTES_INDEX,
  SitemapEntry,
  SitemapIndex,
} from './utils'

const tenantTypeMock = TypeMoq.Mock.ofInstance(TenantClient)
const cmsDataPlaneTypeMock = TypeMoq.Mock.ofInstance(CmsDataPlane)
const contextMock = TypeMoq.Mock.ofType<EventContext>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()

const bucketFor = (bindingId: string) =>
  getBucket(CONTENT_PLATFORM_ROUTES_PREFIX, hashString(bindingId))

const collectPaths = (entries: SitemapEntry[]): string[] =>
  entries.reduce<string[]>(
    (acc, entry) => acc.concat(entry.routes.map(r => r.path)),
    []
  )

interface DataPlaneMockBehavior {
  /**
   * Map of `contentType` → ordered pages. Each call to `listEntries` for a
   * given contentType returns the next page; subsequent calls walk the
   * cursor until the last page (which carries `scroll: null`).
   */
  listings: Record<string, EntriesList[]>
  /**
   * Map of `${contentType}:${entryId}:${locale}` → published entry payload.
   * Missing keys are treated as `404 notFound` (a locale not published for
   * this entry — multi-locale fan-out skips that binding silently).
   */
  entriesByLocaleKey: Record<string, PublishedEntry>
  /**
   * Map of `${contentType}:${entryId}:${locale}` → ETag returned by the Data
   * Plane on a fresh 200 response. When set, this is the ETag the cache
   * layer persists.
   */
  etagByKey?: Record<string, string>
  /**
   * Keys whose `getEntry` call should respond `304 Not Modified` whenever
   * the caller sends an `If-None-Match` matching `etagByKey[key]`. Used to
   * test the cache hit path.
   */
  notModifiedKeys?: Set<string>
}

interface BuildContextOptions {
  dataPlane: DataPlaneMockBehavior
  enableCmsRoutes?: boolean
  enableContentPlatformRoutes?: boolean
  disableRoutesTerm?: string
  bindings?: Tenant['bindings']
  account?: string
  contentPlatformStoreId?: string
  contentPlatformContentTypes?: string[]
  /**
   * Pre-existing entries in the Content Platform cache bucket. Each key is
   * the VBase file name (already base64url-encoded) under
   * `CONTENT_PLATFORM_CACHE_BUCKET`, and the value is the deserialized
   * cached entry. Used to seed cache-hit scenarios.
   */
  initialCache?: Record<string, CachedEntry>
}

const defaultBindings = ([
  {
    canonicalBaseAddress: 'www.host.com',
    defaultLocale: 'en-US',
    id: '1',
    targetProduct: 'vtex-storefront',
  },
  {
    canonicalBaseAddress: 'www.host.com/br',
    defaultLocale: 'pt-BR',
    id: '2',
    targetProduct: 'vtex-storefront',
  },
] as unknown) as Tenant['bindings']

const singleEnBinding = ([
  {
    canonicalBaseAddress: 'www.host.com',
    defaultLocale: 'en-US',
    id: '1',
    targetProduct: 'vtex-storefront',
  },
] as unknown) as Tenant['bindings']

const buildContext = (options: BuildContextOptions): EventContext => {
  const {
    dataPlane,
    enableCmsRoutes = false,
    enableContentPlatformRoutes = true,
    disableRoutesTerm = '',
    bindings = defaultBindings,
    account = 'pm2023team2',
    contentPlatformStoreId,
    contentPlatformContentTypes,
    initialCache,
  } = options
  const logger = makeLogger()

  const VBaseMockClass = createMemoryVBaseMock(ioContext.object, {
    initialData: initialCache
      ? { [CONTENT_PLATFORM_CACHE_BUCKET]: { ...initialCache } }
      : undefined,
  })

  // tslint:disable-next-line:max-classes-per-file
  const vbaseImpl = class extends VBaseMockClass {}

  // tslint:disable-next-line:max-classes-per-file
  const tenant = class TenantMock extends tenantTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public info = async (_?: RequestConfig) => ({ bindings } as Tenant)
  }

  let listEntriesCalls = 0
  let getEntryCalls = 0
  const listingCursors: Record<string, number> = {}

  // tslint:disable-next-line:max-classes-per-file
  const cmsDataPlane = class CmsDataPlaneMock extends cmsDataPlaneTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public listEntries = async ({
      contentType,
    }: {
      contentType: string
    }): Promise<DataPlaneListResponse<EntriesList>> => {
      listEntriesCalls += 1
      const pages = dataPlane.listings[contentType] ?? []
      const cursor = listingCursors[contentType] ?? 0
      const page = pages[cursor]
      listingCursors[contentType] = cursor + 1
      if (!page) {
        return {
          data: { entries: [], scroll: null },
          notModified: false,
        }
      }
      return { data: page, notModified: false }
    }

    public getEntry = async ({
      contentType,
      entryId,
      locale,
      etag,
    }: {
      contentType: string
      entryId: string
      locale?: string
      etag?: string
    }): Promise<DataPlaneListResponse<PublishedEntry>> => {
      getEntryCalls += 1
      const key = `${contentType}:${entryId}:${locale ?? ''}`
      const responseEtag = dataPlane.etagByKey?.[key]
      if (
        etag &&
        responseEtag &&
        etag === responseEtag &&
        dataPlane.notModifiedKeys?.has(key)
      ) {
        return { etag, notModified: true }
      }
      const entry = dataPlane.entriesByLocaleKey[key]
      if (!entry) {
        return { notFound: true, notModified: false }
      }
      return { data: entry, etag: responseEtag, notModified: false }
    }
  }

  // tslint:disable-next-line:max-classes-per-file
  const ClientsImpl = class ClientsMock extends Clients {
    get vbase() {
      return this.getOrSet('vbase', vbaseImpl)
    }

    get tenant() {
      return this.getOrSet('tenant', tenant)
    }

    get cmsDataPlane() {
      return this.getOrSet('cmsDataPlane', cmsDataPlane)
    }
  }

  const context = {
    ...contextMock.object,
    body: {
      generationId: 'gen-1',
    },
    clients: new ClientsImpl({}, ioContext.object),
    state: {
      ...state.object,
      settings: {
        contentPlatformContentTypes,
        contentPlatformStoreId,
        disableRoutesTerm,
        enableAppsRoutes: true,
        enableCmsRoutes,
        enableContentPlatformRoutes,
        enableNavigationRoutes: true,
        enableProductRoutes: true,
        ignoreBindings: false,
      },
    },
    vtex: {
      ...ioContext.object,
      account,
      logger: (logger as unknown) as Logger,
    },
  } as EventContext

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(context as any).__logger = logger
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(context as any).__listEntriesCalls = () => listEntriesCalls
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(context as any).__getEntryCalls = () => getEntryCalls

  return context
}

const makeListingEntry = (
  overrides: Partial<ContentEntry> & Pick<ContentEntry, 'id'>
): ContentEntry => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: null,
  name: overrides.name ?? `Entry ${overrides.id}`,
  searchKeywords: [],
  updatedAt: '2026-05-27T18:14:36.148Z',
  ...overrides,
})

/**
 * Build a mock `PublishedEntry` that mirrors the real Content Platform Data
 * Plane response shape: SEO metadata lives at the **root level** under `seo`,
 * confirmed via direct API inspection. The `slug` field is the CMS internal
 * name key (distinct from the public URL in `seo.slug`).
 */
const makePublishedEntry = (
  overrides: Partial<PublishedEntry> & Pick<PublishedEntry, 'id' | 'seo'>
): PublishedEntry => ({
  sections: [],
  slug: overrides.slug ?? `entry-${overrides.id}`,
  ...overrides,
})

describe('generateContentPlatformRoutes', () => {
  let next: jest.Mock

  beforeEach(() => {
    next = jest.fn()
  })

  it('ingests a landingPage entry using seo.slug as the sitemap path and updatedAt as lastmod (US-1)', async () => {
    const context = buildContext({
      dataPlane: {
        entriesByLocaleKey: {
          'landingPage:lp-1:en-US': makePublishedEntry({
            id: 'lp-1',
            seo: {
              canonical: '',
              slug: '/teste-sitemap-landing-page',
            },
            slug: 'sitemap-landing-page-test',
          }),
        },
        listings: {
          landingPage: [
            {
              entries: [
                makeListingEntry({
                  id: 'lp-1',
                  name: 'Landing Page',
                  updatedAt: '2026-05-27T18:14:36.148Z',
                }),
              ],
              scroll: null,
            },
          ],
        },
      },
    })

    await generateContentPlatformRoutes(context, next)
    expect(next).toBeCalled()

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    expect(index).not.toBeNull()
    const entries = await Promise.all(
      index.index.map(file =>
        vbase.getJSON<SitemapEntry>(bucketFor('1'), file, true)
      )
    )
    expect(collectPaths(entries)).toEqual(['/teste-sitemap-landing-page'])
    expect(entries[0].routes[0].lastmod).toBe('2026-05-27T18:14:36.148Z')
    expect(entries[0].routes[0].source).toBe('content-platform')
  })

  it('skips generation entirely when enableContentPlatformRoutes is off (invariant 9 — settings gating)', async () => {
    const context = buildContext({
      dataPlane: { entriesByLocaleKey: {}, listings: { landingPage: [] } },
      enableContentPlatformRoutes: false,
    })

    await generateContentPlatformRoutes(context, next)
    expect(next).toBeCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((context as any).__listEntriesCalls()).toBe(0)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    expect(index).toBeNull()
  })

  it('does not emit mutual-exclusivity log (handled by generateSitemap)', async () => {
    const context = buildContext({
      dataPlane: { entriesByLocaleKey: {}, listings: { landingPage: [] } },
      enableCmsRoutes: true,
      enableContentPlatformRoutes: true,
    })

    await generateContentPlatformRoutes(context, next)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logger = (context as any).__logger as LoggerCapture
    const mutexCalls = logger.info.mock.calls.filter(
      call => call[0]?.type === 'cms-routes-ignored-by-mutual-exclusivity'
    )
    expect(mutexCalls.length).toBe(0)
  })

  it('excludes entries whose canonical points to a URL different from their own slug (Decision 10 — canonical-only opt-out)', async () => {
    const context = buildContext({
      dataPlane: {
        entriesByLocaleKey: {
          'landingPage:keep:en-US': makePublishedEntry({
            id: 'keep',
            seo: { canonical: '/promo-new', slug: '/promo-new' },
          }),
          'landingPage:old:en-US': makePublishedEntry({
            id: 'old',
            seo: { canonical: '/promo-new', slug: '/promo-old' },
          }),
        },
        listings: {
          landingPage: [
            {
              entries: [
                makeListingEntry({ id: 'keep' }),
                makeListingEntry({ id: 'old' }),
              ],
              scroll: null,
            },
          ],
        },
      },
    })

    await generateContentPlatformRoutes(context, next)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    const entries = await Promise.all(
      index.index.map(file =>
        vbase.getJSON<SitemapEntry>(bucketFor('1'), file, true)
      )
    )
    expect(collectPaths(entries)).toEqual(['/promo-new'])
  })

  it('treats empty-string canonical as "no override" (Data Plane default — Decision 10)', async () => {
    const context = buildContext({
      dataPlane: {
        entriesByLocaleKey: {
          'landingPage:lp-1:en-US': makePublishedEntry({
            id: 'lp-1',
            seo: { canonical: '', slug: '/our-story' },
          }),
        },
        listings: {
          landingPage: [
            {
              entries: [makeListingEntry({ id: 'lp-1' })],
              scroll: null,
            },
          ],
        },
      },
    })

    await generateContentPlatformRoutes(context, next)
    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    const entries = await Promise.all(
      index.index.map(file =>
        vbase.getJSON<SitemapEntry>(bucketFor('1'), file, true)
      )
    )
    expect(collectPaths(entries)).toEqual(['/our-story'])
  })

  it('paginates the listing via scroll cursor until the Data Plane returns null', async () => {
    const context = buildContext({
      dataPlane: {
        entriesByLocaleKey: {
          'landingPage:lp-1:en-US': makePublishedEntry({
            id: 'lp-1',
            seo: { canonical: '', slug: '/a' },
          }),
          'landingPage:lp-2:en-US': makePublishedEntry({
            id: 'lp-2',
            seo: { canonical: '', slug: '/b' },
          }),
          'landingPage:lp-3:en-US': makePublishedEntry({
            id: 'lp-3',
            seo: { canonical: '', slug: '/c' },
          }),
        },
        listings: {
          landingPage: [
            {
              entries: [makeListingEntry({ id: 'lp-1' })],
              scroll: 'cursor-1',
            },
            {
              entries: [
                makeListingEntry({ id: 'lp-2' }),
                makeListingEntry({ id: 'lp-3' }),
              ],
              scroll: null,
            },
          ],
        },
      },
    })

    await generateContentPlatformRoutes(context, next)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((context as any).__listEntriesCalls()).toBeGreaterThanOrEqual(2)
    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    const entries = await Promise.all(
      index.index.map(file =>
        vbase.getJSON<SitemapEntry>(bucketFor('1'), file, true)
      )
    )
    expect(collectPaths(entries).sort()).toEqual(['/a', '/b', '/c'])
  })

  it('honors contentPlatformContentTypes setting when an explicit allowlist is provided', async () => {
    const context = buildContext({
      contentPlatformContentTypes: ['microsite'],
      dataPlane: {
        entriesByLocaleKey: {
          'microsite:m-1:en-US': makePublishedEntry({
            id: 'm-1',
            seo: { canonical: '', slug: '/microsite/holiday' },
          }),
        },
        listings: {
          microsite: [
            {
              entries: [makeListingEntry({ id: 'm-1' })],
              scroll: null,
            },
          ],
        },
      },
    })

    await generateContentPlatformRoutes(context, next)
    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    const entries = await Promise.all(
      index.index.map(file =>
        vbase.getJSON<SitemapEntry>(bucketFor('1'), file, true)
      )
    )
    expect(collectPaths(entries)).toEqual(['/microsite/holiday'])
  })

  it('falls back to the default allowlist when contentPlatformContentTypes is missing or empty', async () => {
    const context = buildContext({
      contentPlatformContentTypes: [],
      dataPlane: {
        entriesByLocaleKey: {
          'landingPage:lp-1:en-US': makePublishedEntry({
            id: 'lp-1',
            seo: { canonical: '', slug: '/our-story' },
          }),
        },
        listings: {
          landingPage: [
            {
              entries: [makeListingEntry({ id: 'lp-1' })],
              scroll: null,
            },
          ],
        },
      },
    })
    await generateContentPlatformRoutes(context, next)
    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    const entries = await Promise.all(
      index.index.map(file =>
        vbase.getJSON<SitemapEntry>(bucketFor('1'), file, true)
      )
    )
    expect(collectPaths(entries)).toEqual(['/our-story'])
  })

  it('emits one URL per actually-published locale and groups alternates from real publications (US-3 multi-locale fidelity)', async () => {
    const context = buildContext({
      bindings: defaultBindings,
      dataPlane: {
        entriesByLocaleKey: {
          'landingPage:lp-1:en-US': makePublishedEntry({
            id: 'lp-1',
            locale_metadata: { code: 'en-US', locale: 'en-US' },
            seo: { canonical: '', slug: '/about' },
          }),
          'landingPage:lp-1:pt-BR': makePublishedEntry({
            id: 'lp-1',
            locale_metadata: { code: 'pt-BR', locale: 'pt-BR' },
            seo: { canonical: '', slug: '/sobre' },
          }),
        },
        listings: {
          landingPage: [
            {
              entries: [makeListingEntry({ id: 'lp-1' })],
              scroll: null,
            },
          ],
        },
      },
    })

    await generateContentPlatformRoutes(context, next)

    const { vbase } = context.clients
    const indexEn = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    const indexPt = await vbase.getJSON<SitemapIndex>(
      bucketFor('2'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    const enEntry = await vbase.getJSON<SitemapEntry>(
      bucketFor('1'),
      indexEn.index[0],
      true
    )
    const ptEntry = await vbase.getJSON<SitemapEntry>(
      bucketFor('2'),
      indexPt.index[0],
      true
    )
    expect(enEntry.routes[0].path).toBe('/about')
    expect(ptEntry.routes[0].path).toBe('/sobre')
    expect(enEntry.routes[0].alternates).toEqual([
      { bindingId: '1', path: '/about' },
      { bindingId: '2', path: '/sobre' },
    ])
    expect(ptEntry.routes[0].alternates).toEqual([
      { bindingId: '1', path: '/about' },
      { bindingId: '2', path: '/sobre' },
    ])
  })

  it('does NOT synthesize alternates for locales the editor did not publish (404 → silent skip)', async () => {
    const context = buildContext({
      bindings: defaultBindings,
      dataPlane: {
        entriesByLocaleKey: {
          'landingPage:lp-en-only:en-US': makePublishedEntry({
            id: 'lp-en-only',
            seo: { canonical: '', slug: '/about' },
          }),
        },
        listings: {
          landingPage: [
            {
              entries: [makeListingEntry({ id: 'lp-en-only' })],
              scroll: null,
            },
          ],
        },
      },
    })

    await generateContentPlatformRoutes(context, next)

    const { vbase } = context.clients
    const indexEn = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    const indexPt = await vbase.getJSON<SitemapIndex>(
      bucketFor('2'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    expect(indexPt).toBeNull()
    const enEntry = await vbase.getJSON<SitemapEntry>(
      bucketFor('1'),
      indexEn.index[0],
      true
    )
    expect(enEntry.routes[0].alternates).toEqual([
      { bindingId: '1', path: '/about' },
    ])
  })

  it('writes only the en-US bucket for stores with a single binding (smoke parity)', async () => {
    const context = buildContext({
      bindings: singleEnBinding,
      dataPlane: {
        entriesByLocaleKey: {
          'landingPage:lp-1:en-US': makePublishedEntry({
            id: 'lp-1',
            seo: { canonical: '', slug: '/teste-sitemap-landing-page' },
          }),
        },
        listings: {
          landingPage: [
            {
              entries: [makeListingEntry({ id: 'lp-1' })],
              scroll: null,
            },
          ],
        },
      },
    })

    await generateContentPlatformRoutes(context, next)

    const { vbase } = context.clients
    const indexPt = await vbase.getJSON<SitemapIndex>(
      bucketFor('2'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    expect(indexPt).toBeNull()
    const indexEn = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    expect(indexEn).not.toBeNull()
  })

  it('persists the Data Plane ETag in VBase on a fresh 200 response (invariant 13 — ETag cache write)', async () => {
    const context = buildContext({
      bindings: singleEnBinding,
      dataPlane: {
        entriesByLocaleKey: {
          'landingPage:lp-1:en-US': makePublishedEntry({
            id: 'lp-1',
            seo: { canonical: '', slug: '/our-story' },
          }),
        },
        etagByKey: { 'landingPage:lp-1:en-US': 'etag-fresh' },
        listings: {
          landingPage: [
            {
              entries: [makeListingEntry({ id: 'lp-1' })],
              scroll: null,
            },
          ],
        },
      },
    })

    await generateContentPlatformRoutes(context, next)
    const cached = await context.clients.vbase.getJSON<CachedEntry>(
      CONTENT_PLATFORM_CACHE_BUCKET,
      cacheFileNameFor({
        contentType: 'landingPage',
        entryId: 'lp-1',
        locale: 'en-US',
      }),
      true
    )
    expect(cached).not.toBeNull()
    expect(cached.etag).toBe('etag-fresh')
    expect(cached.entry.seo?.slug).toBe('/our-story')
  })

  it('reuses the cached PublishedEntry when the Data Plane returns 304 (invariant 13 — ETag cache hit)', async () => {
    const fileName = cacheFileNameFor({
      contentType: 'landingPage',
      entryId: 'lp-1',
      locale: 'en-US',
    })
    const seedCachedEntry = makePublishedEntry({
      id: 'lp-1',
      seo: { canonical: '', slug: '/cached-from-previous-run' },
    })
    const context = buildContext({
      bindings: singleEnBinding,
      dataPlane: {
        // The Data Plane will respond 304, so the listing-only payload is
        // returned but the body intentionally does NOT contain the entry —
        // the middleware must read it from the cache, not the live response.
        entriesByLocaleKey: {},
        etagByKey: { 'landingPage:lp-1:en-US': 'etag-prev' },
        listings: {
          landingPage: [
            {
              entries: [makeListingEntry({ id: 'lp-1' })],
              scroll: null,
            },
          ],
        },
        notModifiedKeys: new Set(['landingPage:lp-1:en-US']),
      },
      initialCache: {
        [fileName]: {
          cachedAt: '2026-05-26T00:00:00.000Z',
          entry: seedCachedEntry,
          etag: 'etag-prev',
        },
      },
    })

    await generateContentPlatformRoutes(context, next)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    const entries = await Promise.all(
      index.index.map(file =>
        vbase.getJSON<SitemapEntry>(bucketFor('1'), file, true)
      )
    )
    expect(collectPaths(entries)).toEqual(['/cached-from-previous-run'])
  })

  it('honors disableRoutesTerm by filtering out matching substrings', async () => {
    const context = buildContext({
      dataPlane: {
        entriesByLocaleKey: {
          'landingPage:keep:en-US': makePublishedEntry({
            id: 'keep',
            seo: { canonical: '', slug: '/keep' },
          }),
          'landingPage:hide:en-US': makePublishedEntry({
            id: 'hide',
            seo: { canonical: '', slug: '/internal/staging-only' },
          }),
        },
        listings: {
          landingPage: [
            {
              entries: [
                makeListingEntry({ id: 'keep' }),
                makeListingEntry({ id: 'hide' }),
              ],
              scroll: null,
            },
          ],
        },
      },
      disableRoutesTerm: '/internal/',
    })

    await generateContentPlatformRoutes(context, next)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CONTENT_PLATFORM_ROUTES_INDEX,
      true
    )
    const entries = await Promise.all(
      index.index.map(file =>
        vbase.getJSON<SitemapEntry>(bucketFor('1'), file, true)
      )
    )
    expect(collectPaths(entries)).toEqual(['/keep'])
  })
})
