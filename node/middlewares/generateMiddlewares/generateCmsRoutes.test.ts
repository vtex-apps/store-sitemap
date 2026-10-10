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
import { EntityLocator, Internal } from 'vtex.rewriter'

import { Clients } from '../../clients'
import {
  CMS_ROUTES_PREFIX,
  CMS_ROUTES_MAX_URLS_PER_FILE,
  getBucket,
  hashString,
} from '../../utils'
import { Rewriter } from './../../clients/rewriter'
import { generateCmsRoutes } from './generateCmsRoutes'
import {
  CMS_ROUTES_INDEX,
  SitemapEntry,
  SitemapIndex,
} from './utils'

const tenantTypeMock = TypeMoq.Mock.ofInstance(TenantClient)
const rewriterTypeMock = TypeMoq.Mock.ofInstance(Rewriter)
const vbaseTypeMock = TypeMoq.Mock.ofInstance(VBase)
const contextMock = TypeMoq.Mock.ofType<EventContext>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()

let next: any

interface BuildContextOptions {
  internals: Internal[]
  disableRoutesTerm?: string
}

const buildContext = ({ internals, disableRoutesTerm = '' }: BuildContextOptions): EventContext => {
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
            id: '1',
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
  const rewriter = class RewriterMock extends rewriterTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public routesById = async (_: EntityLocator) => []

    public listInternalsWithRetry = async (_: number, cursor: Maybe<string>) => {
      if (cursor === null || cursor === undefined) {
        return { next: null, routes: internals }
      }
      return { next: null, routes: [] as Internal[] }
    }
  }

  // tslint:disable-next-line:max-classes-per-file
  const ClientsImpl = class ClientsMock extends Clients {
    get vbase() {
      return this.getOrSet('vbase', vbase)
    }

    get rewriter() {
      return this.getOrSet('rewriter', rewriter)
    }

    get tenant() {
      return this.getOrSet('tenant', tenant)
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
        disableRoutesTerm,
        enableAppsRoutes: true,
        enableCmsRoutes: true,
        enableNavigationRoutes: true,
        enableProductRoutes: true,
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

describe('generateCmsRoutes', () => {
  beforeEach(() => {
    next = jest.fn()
  })

  it('groups CMS-origin Rewriter Internals by binding and writes them under the cms-routes bucket', async () => {
    const internals = [
      { binding: '1', from: '/our-story', id: 'cms-1', type: 'userRoute' },
      { binding: '1', from: '/black-friday', id: 'cms-2', type: 'user-canonical' },
      { binding: '2', from: '/nossa-historia', id: 'cms-1', type: 'userRoute' },
    ] as Internal[]

    const context = buildContext({ internals })
    await generateCmsRoutes(context, next)

    expect(next).toBeCalled()

    const { vbase } = context.clients
    const bindingOneIndex = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CMS_ROUTES_INDEX,
      true
    )
    expect(bindingOneIndex).not.toBeNull()
    expect(bindingOneIndex.index.length).toBeGreaterThan(0)

    const bindingOneEntries = await Promise.all(
      bindingOneIndex.index.map(file =>
        vbase.getJSON<SitemapEntry>(bucketFor('1'), file, true)
      )
    )
    const bindingOnePaths = collectPaths(bindingOneEntries).sort()
    expect(bindingOnePaths).toEqual(['/black-friday', '/our-story'])

    const bindingTwoIndex = await vbase.getJSON<SitemapIndex>(
      bucketFor('2'),
      CMS_ROUTES_INDEX,
      true
    )
    const bindingTwoEntries = await Promise.all(
      bindingTwoIndex.index.map(file =>
        vbase.getJSON<SitemapEntry>(bucketFor('2'), file, true)
      )
    )
    expect(collectPaths(bindingTwoEntries)).toEqual(['/nossa-historia'])
  })

  it('populates alternates across bindings for the same logical page id (US-3)', async () => {
    const internals = [
      { binding: '1', from: '/our-story', id: 'cms-1', type: 'userRoute' },
      { binding: '2', from: '/nossa-historia', id: 'cms-1', type: 'userRoute' },
    ] as Internal[]

    const context = buildContext({ internals })
    await generateCmsRoutes(context, next)

    const expectedAlternates = [
      { bindingId: '1', path: '/our-story' },
      { bindingId: '2', path: '/nossa-historia' },
    ]

    const { vbase } = context.clients
    const bindingOneIndex = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CMS_ROUTES_INDEX,
      true
    )
    const bindingOneEntry = await vbase.getJSON<SitemapEntry>(
      bucketFor('1'),
      bindingOneIndex.index[0],
      true
    )
    expect(bindingOneEntry.routes[0].alternates).toEqual(expectedAlternates)

    const bindingTwoIndex = await vbase.getJSON<SitemapIndex>(
      bucketFor('2'),
      CMS_ROUTES_INDEX,
      true
    )
    const bindingTwoEntry = await vbase.getJSON<SitemapEntry>(
      bucketFor('2'),
      bindingTwoIndex.index[0],
      true
    )
    expect(bindingTwoEntry.routes[0].alternates).toEqual(expectedAlternates)
  })

  it('sets alternates to a single self entry when the page exists in only one binding', async () => {
    const internals = [
      { binding: '1', from: '/our-story', id: 'cms-1', type: 'userRoute' },
    ] as Internal[]

    const context = buildContext({ internals })
    await generateCmsRoutes(context, next)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CMS_ROUTES_INDEX,
      true
    )
    const entry = await vbase.getJSON<SitemapEntry>(
      bucketFor('1'),
      index.index[0],
      true
    )
    expect(entry.routes[0].alternates).toEqual([
      { bindingId: '1', path: '/our-story' },
    ])
  })

  it('excludes framework-generated types (product, department, category, subcategory, brand) from cms-routes', async () => {
    const internals = [
      { binding: '1', from: '/p/123', id: 'p1', type: 'product' },
      { binding: '1', from: '/fruits', id: 'd1', type: 'department' },
      { binding: '1', from: '/fruits/citrics', id: 'c1', type: 'category' },
      { binding: '1', from: '/fruits/citrics/orange', id: 's1', type: 'subcategory' },
      { binding: '1', from: '/brand-x', id: 'b1', type: 'brand' },
      { binding: '1', from: '/our-story', id: 'cms-1', type: 'userRoute' },
    ] as Internal[]

    const context = buildContext({ internals })
    await generateCmsRoutes(context, next)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CMS_ROUTES_INDEX,
      true
    )
    const entries = await Promise.all(
      index.index.map(file => vbase.getJSON<SitemapEntry>(bucketFor('1'), file, true))
    )
    expect(collectPaths(entries)).toEqual(['/our-story'])
  })

  it('excludes routes with disableSitemapEntry=true (the CMS toggle)', async () => {
    const internals = [
      { binding: '1', from: '/keep', id: 'k', type: 'userRoute' },
      {
        binding: '1',
        disableSitemapEntry: true,
        from: '/hidden',
        id: 'h',
        type: 'userRoute',
      },
    ] as Internal[]

    const context = buildContext({ internals })
    await generateCmsRoutes(context, next)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CMS_ROUTES_INDEX,
      true
    )
    const entries = await Promise.all(
      index.index.map(file => vbase.getJSON<SitemapEntry>(bucketFor('1'), file, true))
    )
    expect(collectPaths(entries)).toEqual(['/keep'])
  })

  it('excludes notFound* types and routes flagged as login or error', async () => {
    const internals = [
      { binding: '1', from: '/not-here', id: 'nf1', type: 'notFound' },
      { binding: '1', from: '/also-missing', id: 'nf2', type: 'notFoundProduct' },
      { binding: '1', from: '/login', id: 'l1', type: 'login' },
      { binding: '1', from: '/error', id: 'e1', type: 'error' },
      { binding: '1', from: '/our-story', id: 'ok', type: 'userRoute' },
    ] as Internal[]

    const context = buildContext({ internals })
    await generateCmsRoutes(context, next)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CMS_ROUTES_INDEX,
      true
    )
    const entries = await Promise.all(
      index.index.map(file => vbase.getJSON<SitemapEntry>(bucketFor('1'), file, true))
    )
    expect(collectPaths(entries)).toEqual(['/our-story'])
  })

  it('honors disableRoutesTerm by filtering out matching substrings', async () => {
    const internals = [
      { binding: '1', from: '/keep', id: '1', type: 'userRoute' },
      { binding: '1', from: '/internal/staging-only', id: '2', type: 'userRoute' },
    ] as Internal[]

    const context = buildContext({ internals, disableRoutesTerm: '/internal/' })
    await generateCmsRoutes(context, next)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CMS_ROUTES_INDEX,
      true
    )
    const entries = await Promise.all(
      index.index.map(file => vbase.getJSON<SitemapEntry>(bucketFor('1'), file, true))
    )
    expect(collectPaths(entries)).toEqual(['/keep'])
  })

  it('chunks routes into multiple files when CMS_ROUTES_MAX_URLS_PER_FILE is exceeded', async () => {
    // Use a small overflow to keep the test fast
    const overflowCount = CMS_ROUTES_MAX_URLS_PER_FILE + 5
    const internals: Internal[] = Array.from({ length: overflowCount }).map(
      (_, i) => ({
        binding: '1',
        from: `/page-${i}`,
        id: `cms-${i}`,
        type: 'userRoute',
      })
    ) as Internal[]

    const context = buildContext({ internals })
    await generateCmsRoutes(context, next)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CMS_ROUTES_INDEX,
      true
    )
    expect(index.index.length).toBe(2)

    const first = await vbase.getJSON<SitemapEntry>(
      bucketFor('1'),
      index.index[0],
      true
    )
    const second = await vbase.getJSON<SitemapEntry>(
      bucketFor('1'),
      index.index[1],
      true
    )
    expect(first.routes.length).toBe(CMS_ROUTES_MAX_URLS_PER_FILE)
    expect(second.routes.length).toBe(5)
  })

  it('skips generation when enableCmsRoutes is off and does not touch VBase', async () => {
    const internals = [
      { binding: '1', from: '/our-story', id: 'cms-1', type: 'userRoute' },
    ] as Internal[]

    const context = buildContext({ internals })
    context.state.settings.enableCmsRoutes = false
    await generateCmsRoutes(context, next)

    const { vbase } = context.clients
    const index = await vbase.getJSON<SitemapIndex>(
      bucketFor('1'),
      CMS_ROUTES_INDEX,
      true
    )
    expect(index).toBeNull()
    expect(next).toBeCalled()
  })
})
