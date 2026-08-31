import {
  IOContext,
  Logger,
  RequestConfig,
  Tenant,
  TenantClient,
  VBase,
  VBaseSaveResponse,
} from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { CmsBuilder, CmsPage } from '../../clients/cmsBuilder'
import { Clients } from '../../clients'
import {
  CMS_ROUTES_PREFIX,
  CMS_ROUTES_MAX_URLS_PER_FILE,
  getBucket,
  hashString,
} from '../../utils'
import {
  DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
  DEFAULT_CONTENT_PLATFORM_STORE_ID,
  DEFAULT_HCMS_CONTENT_TYPES,
  DEFAULT_HCMS_PROJECT_ID,
} from '../settings'
import { generateCmsRoutes } from './generateCmsRoutes'
import {
  CMS_ROUTES_INDEX,
  SitemapEntry,
  SitemapIndex,
} from './utils'

const tenantTypeMock = TypeMoq.Mock.ofInstance(TenantClient)
const cmsBuilderTypeMock = TypeMoq.Mock.ofInstance(CmsBuilder)
const vbaseTypeMock = TypeMoq.Mock.ofInstance(VBase)
const contextMock = TypeMoq.Mock.ofType<EventContext>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()

let next: any

// The default store binding id resolved from the tenant mock below.
const DEFAULT_BINDING_ID = '1'

interface BuildContextOptions {
  pagesByContentType: Record<string, CmsPage[]>
  disableRoutesTerm?: string
}

const page = (overrides: Partial<CmsPage> & { slug?: string | null }): CmsPage => {
  const { slug, ...rest } = overrides
  const seo =
    slug === undefined
      ? undefined
      : { canonical: rest.settings?.seo?.canonical, slug: slug ?? undefined }
  return {
    id: rest.id ?? 'page-id',
    name: rest.name ?? 'Page',
    settings: seo ? { seo } : rest.settings,
    status: rest.status ?? 'published',
    type: rest.type ?? 'landingPage',
  }
}

const buildContext = ({
  pagesByContentType,
  disableRoutesTerm = '',
}: BuildContextOptions): EventContext => {
  // tslint:disable-next-line:max-classes-per-file
  const vbase = class VBaseMock extends vbaseTypeMock.object {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public jsonData: Record<string, any> = {}

    constructor() {
      super(ioContext.object)
    }

    public getJSON = async <T>(
      bucket: string,
      file: string,
      nullOrUndefined?: boolean | undefined
    ): Promise<T> => {
      if (!this.jsonData[bucket]?.[file] && nullOrUndefined) {
        return (null as unknown) as T
      }
      return Promise.resolve(this.jsonData[bucket][file] as T)
    }

    public saveJSON = async <T>(
      bucket: string,
      file: string,
      data: T
    ): Promise<VBaseSaveResponse> => {
      if (!this.jsonData[bucket]) {
        this.jsonData[bucket] = {}
      }
      this.jsonData[bucket][file] = data
      return Promise.resolve(({
        updated: true,
      } as unknown) as VBaseSaveResponse)
    }
  }

  // tslint:disable-next-line:max-classes-per-file
  const tenant = class TenantMock extends tenantTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public info = async (_?: RequestConfig) => {
      return {
        bindings: [
          {
            id: DEFAULT_BINDING_ID,
            targetProduct: 'vtex-storefront',
          },
          {
            id: '2',
            targetProduct: 'vtex-storefront',
          },
        ],
      } as Tenant
    }
  }

  // tslint:disable-next-line:max-classes-per-file
  const cmsBuilder = class CmsBuilderMock extends cmsBuilderTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public listAllPages = async (_projectId: string, contentType: string) =>
      pagesByContentType[contentType] ?? []
  }

  // tslint:disable-next-line:max-classes-per-file
  const ClientsImpl = class ClientsMock extends Clients {
    get vbase() {
      return this.getOrSet('vbase', vbase)
    }

    get tenant() {
      return this.getOrSet('tenant', tenant)
    }

    get cmsBuilder() {
      return this.getOrSet('cmsBuilder', cmsBuilder)
    }
  }

  return {
    ...contextMock.object,
    body: {
      generationId: 'gen-1',
    },
    clients: new ClientsImpl({}, ioContext.object),
    state: {
      ...state.object,
      settings: {
        contentPlatformContentTypes: DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
        contentPlatformStoreId: DEFAULT_CONTENT_PLATFORM_STORE_ID,
        disableRoutesTerm,
        enableAppsRoutes: true,
        enableCmsRoutes: true,
        enableContentPlatformRoutes: false,
        enableNavigationRoutes: true,
        enableProductRoutes: true,
        hcmsContentTypes: DEFAULT_HCMS_CONTENT_TYPES,
        hcmsProjectId: DEFAULT_HCMS_PROJECT_ID,
        ignoreBindings: false,
      },
    },
    vtex: {
      ...ioContext.object,
      logger: loggerMock.object,
    },
  } as EventContext
}

const bucketFor = (bindingId: string) => getBucket(CMS_ROUTES_PREFIX, hashString(bindingId))

const collectPaths = (entries: SitemapEntry[]): string[] =>
  entries.reduce<string[]>(
    (acc, entry) => acc.concat(entry.routes.map(r => r.path)),
    []
  )

const readSavedPaths = async (
  context: EventContext,
  bindingId = DEFAULT_BINDING_ID
): Promise<string[]> => {
  const { vbase } = context.clients
  const index = await vbase.getJSON<SitemapIndex>(
    bucketFor(bindingId),
    CMS_ROUTES_INDEX,
    true
  )
  if (!index) {
    return []
  }
  const entries = await Promise.all(
    index.index.map(file =>
      vbase.getJSON<SitemapEntry>(bucketFor(bindingId), file, true)
    )
  )
  return collectPaths(entries)
}

describe('generateCmsRoutes', () => {
  beforeEach(() => {
    next = jest.fn()
  })

  it('emits published Headless CMS slugs under the default store binding', async () => {
    const context = buildContext({
      pagesByContentType: {
        landingPage: [
          page({ id: '1', slug: '/our-story' }),
          page({ id: '2', slug: '/black-friday' }),
        ],
      },
    })
    await generateCmsRoutes(context, next)

    expect(next).toBeCalled()
    const paths = (await readSavedPaths(context)).sort()
    expect(paths).toEqual(['/black-friday', '/our-story'])

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor(DEFAULT_BINDING_ID),
      CMS_ROUTES_INDEX,
      true
    )
    expect(index?.index).toEqual(['hcms-routes-0'])
    expect(index?.index).not.toContain('cms-routes-0')
  })

  it('sets alternates to a single self entry pointing at the default binding', async () => {
    const context = buildContext({
      pagesByContentType: {
        landingPage: [page({ id: '1', slug: '/our-story' })],
      },
    })
    await generateCmsRoutes(context, next)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor(DEFAULT_BINDING_ID),
      CMS_ROUTES_INDEX,
      true
    )
    const entry = await vbase.getJSON<SitemapEntry>(
      bucketFor(DEFAULT_BINDING_ID),
      index.index[0],
      true
    )
    expect(entry.routes[0].alternates).toEqual([
      { bindingId: DEFAULT_BINDING_ID, path: '/our-story' },
    ])
  })

  it('excludes draft pages (only published reach the sitemap)', async () => {
    const context = buildContext({
      pagesByContentType: {
        landingPage: [
          page({ id: '1', slug: '/keep' }),
          page({ id: '2', slug: '/wip', status: 'draft' }),
        ],
      },
    })
    await generateCmsRoutes(context, next)
    expect(await readSavedPaths(context)).toEqual(['/keep'])
  })

  it('excludes pages without a slug and the homepage (slug "/")', async () => {
    const context = buildContext({
      pagesByContentType: {
        landingPage: [
          page({ id: '1', slug: '/our-story' }),
          page({ id: '2', slug: null }),
          page({ id: '3', slug: '/' }),
        ],
      },
    })
    await generateCmsRoutes(context, next)
    expect(await readSavedPaths(context)).toEqual(['/our-story'])
  })

  it('excludes pages whose canonical points to a different URL, keeps self-canonical', async () => {
    const context = buildContext({
      pagesByContentType: {
        landingPage: [
          page({
            id: '1',
            settings: { seo: { canonical: '/other', slug: '/promo-old' } },
            slug: '/promo-old',
          }),
          page({
            id: '2',
            settings: { seo: { canonical: '/self', slug: '/self' } },
            slug: '/self',
          }),
        ],
      },
    })
    await generateCmsRoutes(context, next)
    expect(await readSavedPaths(context)).toEqual(['/self'])
  })

  it('honors disableRoutesTerm by filtering out matching substrings', async () => {
    const context = buildContext({
      disableRoutesTerm: '/internal/',
      pagesByContentType: {
        landingPage: [
          page({ id: '1', slug: '/keep' }),
          page({ id: '2', slug: '/internal/staging-only' }),
        ],
      },
    })
    await generateCmsRoutes(context, next)
    expect(await readSavedPaths(context)).toEqual(['/keep'])
  })

  it('chunks routes into multiple files when CMS_ROUTES_MAX_URLS_PER_FILE is exceeded', async () => {
    const overflowCount = CMS_ROUTES_MAX_URLS_PER_FILE + 5
    const pages: CmsPage[] = Array.from({ length: overflowCount }).map((_, i) =>
      page({ id: `cms-${i}`, slug: `/page-${i}` })
    )
    const context = buildContext({ pagesByContentType: { landingPage: pages } })
    await generateCmsRoutes(context, next)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor(DEFAULT_BINDING_ID),
      CMS_ROUTES_INDEX,
      true
    )
    expect(index.index.length).toBe(2)

    const first = await vbase.getJSON<SitemapEntry>(
      bucketFor(DEFAULT_BINDING_ID),
      index.index[0],
      true
    )
    const second = await vbase.getJSON<SitemapEntry>(
      bucketFor(DEFAULT_BINDING_ID),
      index.index[1],
      true
    )
    expect(first.routes.length).toBe(CMS_ROUTES_MAX_URLS_PER_FILE)
    expect(second.routes.length).toBe(5)
  })

  it('skips generation when enableCmsRoutes is off and does not touch VBase', async () => {
    const context = buildContext({
      pagesByContentType: {
        landingPage: [page({ id: '1', slug: '/our-story' })],
      },
    })
    context.state.settings.enableCmsRoutes = false
    await generateCmsRoutes(context, next)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor(DEFAULT_BINDING_ID),
      CMS_ROUTES_INDEX,
      true
    )
    expect(index).toBeNull()
    expect(next).toBeCalled()
  })

  it('skips generation and does NOT touch VBase when Content Platform is the active source (US-6 / Decision 8)', async () => {
    const context = buildContext({
      pagesByContentType: {
        landingPage: [page({ id: '1', slug: '/our-story' })],
      },
    })
    context.state.settings.enableCmsRoutes = true
    context.state.settings.enableContentPlatformRoutes = true
    await generateCmsRoutes(context, next)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor(DEFAULT_BINDING_ID),
      CMS_ROUTES_INDEX,
      true
    )
    expect(index).toBeNull()
    expect(next).toBeCalled()
  })
})
