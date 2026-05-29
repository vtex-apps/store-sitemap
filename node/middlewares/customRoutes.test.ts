import {
  IOContext,
  IOResponse,
  Logger,
  VBase,
  VBaseSaveResponse,
} from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { Clients } from '../clients'
import { CUSTOM_ROUTES_BUCKET, CUSTOM_ROUTES_FILENAME } from '../utils'
import { customRoutes } from './customRoutes'
import {
  DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
  DEFAULT_CONTENT_PLATFORM_STORE_ID,
} from './settings'

const vbaseTypeMock = TypeMoq.Mock.ofInstance(VBase)
const contextMock = TypeMoq.Mock.ofType<Context>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()

describe('Test customRoutes middleware', () => {
  let context: Context
  let cachedData: CustomRoutesData | null

  const vbase = class VBaseMock extends vbaseTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public getJSON = async <T>(
      bucket: string,
      file: string,
      _?: boolean | undefined
    ): Promise<T> => {
      if (bucket === CUSTOM_ROUTES_BUCKET && file === CUSTOM_ROUTES_FILENAME) {
        return (cachedData as unknown) as T
      }
      return (null as unknown) as T
    }

    public saveJSON = async <T>(
      _bucket: string,
      _file: string,
      _data: T
    ): Promise<VBaseSaveResponse> => {
      return {} as VBaseSaveResponse
    }

    public deleteFile = async (
      _bucket: string,
      _file: string
    ): Promise<IOResponse<void>> => {
      return {} as IOResponse<void>
    }
  }

  const next = jest.fn()

  beforeEach(() => {
    // Reset mocks
    next.mockClear()
    loggerMock.reset()

    // tslint:disable-next-line: max-classes-per-file
    const ClientsImpl = class ClientsMock extends Clients {
      public get vbase() {
        return this.getOrSet('vbase', vbase)
      }
    }

    cachedData = null

    context = {
      ...contextMock.object,
      clients: new ClientsImpl({}, ioContext.object),
      state: {
        ...state.object,
        settings: {
          contentPlatformContentTypes: DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
          contentPlatformStoreId: DEFAULT_CONTENT_PLATFORM_STORE_ID,
          disableRoutesTerm: '',
          enableAppsRoutes: true,
          enableCmsRoutes: false,
          enableContentPlatformRoutes: false,
          enableNavigationRoutes: true,
          enableProductRoutes: true,
          ignoreBindings: false,
        },
      },
      vtex: {
        ...ioContext.object,
        logger: loggerMock.object,
      },
    }
  })

  it('should filter out apps-routes when enableAppsRoutes is disabled', async () => {
    const mockData = {
      data: [
        { name: 'apps-routes', routes: ['/app-1', '/app-2'] },
        { name: 'user-routes', routes: ['/user-1', '/user-2'] },
      ],
      timestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
    }
    cachedData = mockData
    context.state.settings.enableAppsRoutes = false

    await customRoutes(context, next)

    expect(context.status).toBe(200)
    expect(context.body).toEqual([
      { name: 'user-routes', routes: ['/user-1', '/user-2'] },
    ])
    expect(context.state.useLongCacheControl).toBe(true)
    expect(next).toHaveBeenCalled()
  })

  it('should return all routes when enableAppsRoutes is enabled', async () => {
    const mockData = {
      data: [
        { name: 'apps-routes', routes: ['/app-1', '/app-2'] },
        { name: 'user-routes', routes: ['/user-1', '/user-2'] },
      ],
      timestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
    }
    cachedData = mockData

    await customRoutes(context, next)

    expect(context.status).toBe(200)
    expect(context.body).toEqual(mockData.data)
    expect(context.state.useLongCacheControl).toBe(true)
    expect(next).toHaveBeenCalled()
  })

  it('should return 404 when enableAppsRoutes is enabled but no cached data exists', async () => {
    cachedData = null

    await customRoutes(context, next)

    expect(context.status).toBe(404)
    expect(context.body).toHaveProperty('message')
    expect(next).toHaveBeenCalled()
  })

  it('should serve stale data and trigger background regeneration when data is old', async () => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000
    const mockData = {
      data: [{ name: 'app1', routes: ['/custom-1'] }],
      timestamp: Date.now() - ONE_DAY_MS - 1000, // Slightly over 1 day old
    }
    cachedData = mockData

    await customRoutes(context, next)

    expect(context.status).toBe(200)
    expect(context.body).toEqual(mockData.data)
    expect(context.state.useLongCacheControl).toBe(true)
    expect(next).toHaveBeenCalled()
  })

  it('should expose cms-routes when enableCmsRoutes is true', async () => {
    const mockData = {
      data: [
        { name: 'apps-routes', routes: ['/app-1'] },
        { name: 'user-routes', routes: ['/user-1'] },
        { name: 'cms-routes', routes: ['/our-story', '/black-friday'] },
      ],
      timestamp: Date.now() - 1000 * 60 * 60,
    }
    cachedData = mockData
    context.state.settings.enableCmsRoutes = true

    await customRoutes(context, next)

    expect(context.status).toBe(200)
    expect(context.body).toEqual(mockData.data)
    expect(next).toHaveBeenCalled()
  })

  it('should omit cms-routes when enableCmsRoutes is false (rollout-gated)', async () => {
    const mockData = {
      data: [
        { name: 'apps-routes', routes: ['/app-1'] },
        { name: 'user-routes', routes: ['/user-1'] },
        { name: 'cms-routes', routes: ['/our-story'] },
      ],
      timestamp: Date.now() - 1000 * 60 * 60,
    }
    cachedData = mockData
    context.state.settings.enableCmsRoutes = false

    await customRoutes(context, next)

    expect(context.status).toBe(200)
    expect(context.body).toEqual([
      { name: 'apps-routes', routes: ['/app-1'] },
      { name: 'user-routes', routes: ['/user-1'] },
    ])
    expect(next).toHaveBeenCalled()
  })

  it('should expose content-platform-routes when enableContentPlatformRoutes is true (US-5)', async () => {
    const mockData = {
      data: [
        { name: 'apps-routes', routes: ['/app-1'] },
        { name: 'user-routes', routes: ['/user-1'] },
        { name: 'cms-routes', routes: [] },
        {
          name: 'content-platform-routes',
          routes: ['/our-story', '/microsite/holiday'],
        },
      ],
      timestamp: Date.now() - 1000 * 60 * 60,
    }
    cachedData = mockData
    context.state.settings.enableContentPlatformRoutes = true

    await customRoutes(context, next)

    expect(context.status).toBe(200)
    expect(context.body).toEqual([
      { name: 'apps-routes', routes: ['/app-1'] },
      { name: 'user-routes', routes: ['/user-1'] },
      {
        name: 'content-platform-routes',
        routes: ['/our-story', '/microsite/holiday'],
      },
    ])
    expect(next).toHaveBeenCalled()
  })

  it('should omit content-platform-routes when its flag is off (US-5 — invariant 9)', async () => {
    const mockData = {
      data: [
        { name: 'apps-routes', routes: ['/app-1'] },
        { name: 'user-routes', routes: ['/user-1'] },
        { name: 'content-platform-routes', routes: ['/our-story'] },
      ],
      timestamp: Date.now() - 1000 * 60 * 60,
    }
    cachedData = mockData
    context.state.settings.enableContentPlatformRoutes = false

    await customRoutes(context, next)

    expect(context.status).toBe(200)
    expect(context.body).toEqual([
      { name: 'apps-routes', routes: ['/app-1'] },
      { name: 'user-routes', routes: ['/user-1'] },
    ])
  })

  it('exposes ONLY content-platform-routes (not cms-routes) when both flags are on — Content Platform wins (US-5 / Decision 8)', async () => {
    const mockData = {
      data: [
        { name: 'apps-routes', routes: ['/app-1'] },
        { name: 'user-routes', routes: ['/user-1'] },
        { name: 'cms-routes', routes: ['/hcms-page'] },
        { name: 'content-platform-routes', routes: ['/cp-page'] },
      ],
      timestamp: Date.now() - 1000 * 60 * 60,
    }
    cachedData = mockData
    context.state.settings.enableCmsRoutes = true
    context.state.settings.enableContentPlatformRoutes = true

    await customRoutes(context, next)

    expect(context.status).toBe(200)
    expect(context.body).toEqual([
      { name: 'apps-routes', routes: ['/app-1'] },
      { name: 'user-routes', routes: ['/user-1'] },
      { name: 'content-platform-routes', routes: ['/cp-page'] },
    ])
  })

  it('returns only apps-routes + user-routes when both CMS flags are off (US-6 — backwards compatibility)', async () => {
    const mockData = {
      data: [
        { name: 'apps-routes', routes: ['/app-1'] },
        { name: 'user-routes', routes: ['/user-1'] },
        { name: 'cms-routes', routes: ['/hcms-page'] },
        { name: 'content-platform-routes', routes: ['/cp-page'] },
      ],
      timestamp: Date.now() - 1000 * 60 * 60,
    }
    cachedData = mockData
    context.state.settings.enableCmsRoutes = false
    context.state.settings.enableContentPlatformRoutes = false

    await customRoutes(context, next)

    expect(context.body).toEqual([
      { name: 'apps-routes', routes: ['/app-1'] },
      { name: 'user-routes', routes: ['/user-1'] },
    ])
  })
})
