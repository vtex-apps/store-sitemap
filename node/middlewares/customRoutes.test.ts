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
          disableRoutesTerm: '',
          enableAppsRoutes: true,
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
})
