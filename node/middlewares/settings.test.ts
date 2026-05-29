import { Apps, IOContext, Logger, RequestTracingConfig } from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { Clients } from '../clients'
import { APPS_ROUTES_INDEX, CMS_ROUTES_INDEX, PRODUCT_ROUTES_INDEX, REWRITER_ROUTES_INDEX } from './generateMiddlewares/utils'
import { settings } from './settings'

const appsTypeMock = TypeMoq.Mock.ofInstance(Apps)
const contextMock = TypeMoq.Mock.ofType<Context>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()

describe('Test settings middleware', () => {
  let context: Context

  const apps = class AppsMock extends appsTypeMock.object {
    public settings = {
      enableAppsRoutes: true,
      enableNavigationRoutes: true,
      enableProductRoutes: true,
    }

    constructor() {
      super(ioContext.object)
    }

    public getAppSettings = async (_: string, __?: RequestTracingConfig) => this.settings
  }

  const next = jest.fn()

  beforeEach(() => {
    // tslint:disable-next-line: max-classes-per-file
    const ClientsImpl = class ClientsMock extends Clients {
      get apps() {
        return this.getOrSet('apps', apps)
      }
    }

    context = {
      ...contextMock.object,
      clients: new ClientsImpl({}, ioContext.object),
      state: {
        ...state.object,
      },
      vtex: {
        ...ioContext.object,
        logger: loggerMock.object,
      },
    }
  })

  it('Should get correct apps index files', async () => {
    await settings(context, next)
    expect(context.state.enabledIndexFiles).toStrictEqual([APPS_ROUTES_INDEX, REWRITER_ROUTES_INDEX, PRODUCT_ROUTES_INDEX])

    let appClient = context.clients.apps as any
    appClient.settings = {
      enableAppsRoutes: true,
      enableNavigationRoutes: true,
      enableProductRoutes: false,
    }
    await settings(context, next)
    expect(context.state.enabledIndexFiles).toStrictEqual([APPS_ROUTES_INDEX, REWRITER_ROUTES_INDEX])

    appClient = context.clients.apps as any
    appClient.settings = {
      enableAppsRoutes: false,
      enableNavigationRoutes: false,
      enableProductRoutes: true,
    }
    await settings(context, next)
    expect(context.state.enabledIndexFiles).toStrictEqual([PRODUCT_ROUTES_INDEX])

    appClient = context.clients.apps as any
    appClient.settings = {
      enableAppsRoutes: false,
      enableNavigationRoutes: false,
      enableProductRoutes: false,
    }
    await settings(context, next)
    expect(context.state.enabledIndexFiles).toStrictEqual([])
  })

  it('Should NOT include CMS_ROUTES_INDEX in enabledIndexFiles when enableCmsRoutes is true (CMS uses its own bucket)', async () => {
    const appClient = context.clients.apps as any
    appClient.settings = {
      enableAppsRoutes: false,
      enableCmsRoutes: true,
      enableNavigationRoutes: false,
      enableProductRoutes: false,
    }
    await settings(context, next)
    expect(context.state.enabledIndexFiles).not.toContain(CMS_ROUTES_INDEX)
    expect(context.state.enabledIndexFiles).toStrictEqual([])
  })

  it('Should omit CMS_ROUTES_INDEX when enableCmsRoutes is false (default rollout state)', async () => {
    const appClient = context.clients.apps as any
    appClient.settings = {
      enableAppsRoutes: true,
      enableCmsRoutes: false,
      enableNavigationRoutes: true,
      enableProductRoutes: true,
    }
    await settings(context, next)
    expect(context.state.enabledIndexFiles).not.toContain(CMS_ROUTES_INDEX)
    expect(context.state.enabledIndexFiles).toStrictEqual([
      APPS_ROUTES_INDEX,
      REWRITER_ROUTES_INDEX,
      PRODUCT_ROUTES_INDEX,
    ])
  })
})
