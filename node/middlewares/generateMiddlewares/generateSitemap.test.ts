import { Events, IOContext, Logger } from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { Clients } from '../../clients'
import {
  DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
  DEFAULT_CONTENT_PLATFORM_STORE_ID,
} from '../settings'
import { generateSitemap } from './generateSitemap'
import {
  GENERATE_APPS_ROUTES_EVENT,
  GENERATE_CMS_ROUTES_EVENT,
  GENERATE_CONTENT_PLATFORM_ROUTES_EVENT,
  GENERATE_PRODUCT_ROUTES_EVENT,
  GENERATE_REWRITER_ROUTES_EVENT,
} from './utils'

const eventsTypeMock = TypeMoq.Mock.ofInstance(Events)
const contextMock = TypeMoq.Mock.ofType<EventContext>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()

const eventSent = jest.fn()

const DEFAULT_APPS_ROUTES_PAYLOAD = {
  generationId: '1',
}

const DEFAULT_REWRITER_ROUTES_PAYLOAD = {
  count: 0,
  disableRoutesTerm: '',
  generationId: '1',
  next: null,
  report: {},
}

const DEFAULT_PRODUCT_ROUTES_PAYLOAD: ProductRoutesGenerationEvent = {
  generationId: '1',
  invalidProducts: 0,
  page: 1,
  processedProducts: 0,
}

describe('Test generate sitemap', () => {
  let context: EventContext
  const events = class EventsMock extends eventsTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public sendEvent = async (
      _: any,
      route: string,
      message?: any,
      __?: any
    ) => {
      eventSent(_, route, message)
    }
  }

  beforeEach(() => {
    // tslint:disable-next-line:max-classes-per-file
    const ClientsImpl = class ClientsMock extends Clients {
      get events() {
        return this.getOrSet('events', events)
      }
    }

    jest.clearAllMocks()

    context = {
      ...contextMock.object,
      body: {
        generationId: '1',
      },
      clients: new ClientsImpl({}, ioContext.object),
      state: {
        ...state.object,
        settings: {
          contentPlatformContentTypes: DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
          contentPlatformStoreId: DEFAULT_CONTENT_PLATFORM_STORE_ID,
          disableRoutesTerm: '',
          enableAppsRoutes: true,
          enableCmsRoutes: true,
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

  it('Should send both events', async () => {
    await generateSitemap(context)
    expect(eventSent).toHaveBeenCalledWith(
      '',
      GENERATE_REWRITER_ROUTES_EVENT,
      DEFAULT_REWRITER_ROUTES_PAYLOAD
    )
    expect(eventSent).toHaveBeenCalledWith(
      '',
      GENERATE_PRODUCT_ROUTES_EVENT,
      DEFAULT_PRODUCT_ROUTES_PAYLOAD
    )
    expect(eventSent).toHaveBeenCalledWith(
      '',
      GENERATE_APPS_ROUTES_EVENT,
      DEFAULT_APPS_ROUTES_PAYLOAD
    )
    expect(eventSent).toHaveBeenCalledWith(
      '',
      GENERATE_CMS_ROUTES_EVENT,
      { generationId: '1' }
    )
  })

  it('Should send only enabled events', async () => {
    context.state.settings = {
      contentPlatformContentTypes: DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
      contentPlatformStoreId: DEFAULT_CONTENT_PLATFORM_STORE_ID,
      disableRoutesTerm: '',
      enableAppsRoutes: true,
      enableCmsRoutes: true,
      enableContentPlatformRoutes: false,
      enableNavigationRoutes: true,
      enableProductRoutes: false,
      ignoreBindings: false,
    }

    await generateSitemap(context)
    expect(eventSent).toHaveBeenCalledWith(
      '',
      GENERATE_REWRITER_ROUTES_EVENT,
      DEFAULT_REWRITER_ROUTES_PAYLOAD
    )
    expect(eventSent).toHaveBeenCalledWith(
      '',
      GENERATE_APPS_ROUTES_EVENT,
      DEFAULT_APPS_ROUTES_PAYLOAD
    )
    // hCMS event also fires because enableCmsRoutes is on and Content
    // Platform is off (active source resolves to 'hcms' per Decision 8).
    expect(eventSent).toHaveBeenCalledWith(
      '',
      GENERATE_CMS_ROUTES_EVENT,
      { generationId: '1' }
    )
    expect(eventSent).toHaveBeenCalledTimes(3)

    jest.clearAllMocks()
    context.state.settings = {
      contentPlatformContentTypes: DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
      contentPlatformStoreId: DEFAULT_CONTENT_PLATFORM_STORE_ID,
      disableRoutesTerm: '',
      enableAppsRoutes: false,
      enableCmsRoutes: true,
      enableContentPlatformRoutes: false,
      enableNavigationRoutes: false,
      enableProductRoutes: true,
      ignoreBindings: false,
    }

    await generateSitemap(context)
    expect(eventSent).toHaveBeenCalledWith(
      '',
      GENERATE_PRODUCT_ROUTES_EVENT,
      DEFAULT_PRODUCT_ROUTES_PAYLOAD
    )
    expect(eventSent).toHaveBeenCalledWith(
      '',
      GENERATE_CMS_ROUTES_EVENT,
      { generationId: '1' }
    )
    expect(eventSent).toHaveBeenCalledTimes(2)
  })

  it('emits GENERATE_CONTENT_PLATFORM_ROUTES_EVENT (not the hCMS event) when the Content Platform flag wins (US-6 / Decision 8)', async () => {
    context.state.settings = {
      contentPlatformContentTypes: DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
      contentPlatformStoreId: DEFAULT_CONTENT_PLATFORM_STORE_ID,
      disableRoutesTerm: '',
      enableAppsRoutes: false,
      enableCmsRoutes: true,
      enableContentPlatformRoutes: true,
      enableNavigationRoutes: false,
      enableProductRoutes: false,
      ignoreBindings: false,
    }

    await generateSitemap(context)
    expect(eventSent).toHaveBeenCalledWith(
      '',
      GENERATE_CONTENT_PLATFORM_ROUTES_EVENT,
      { generationId: '1' }
    )
    // hCMS event MUST NOT fire when Content Platform is the active source.
    const cmsCall = eventSent.mock.calls.find(
      ([, event]) => event === GENERATE_CMS_ROUTES_EVENT
    )
    expect(cmsCall).toBeUndefined()
    expect(eventSent).toHaveBeenCalledTimes(1)
  })

  it('emits cms-routes-ignored-by-mutual-exclusivity once per generation when both flags are on (US-6 / Decision 8)', async () => {
    const infoSpy = jest.fn()
    context.vtex.logger = {
      ...loggerMock.object,
      info: infoSpy,
    } as unknown as Logger
    context.state.settings = {
      contentPlatformContentTypes: DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
      contentPlatformStoreId: DEFAULT_CONTENT_PLATFORM_STORE_ID,
      disableRoutesTerm: '',
      enableAppsRoutes: false,
      enableCmsRoutes: true,
      enableContentPlatformRoutes: true,
      enableNavigationRoutes: false,
      enableProductRoutes: false,
      ignoreBindings: false,
    }

    await generateSitemap(context)

    expect(
      infoSpy.mock.calls.some(
        call => call[0]?.type === 'cms-routes-ignored-by-mutual-exclusivity'
      )
    ).toBe(true)
    expect(eventSent).toHaveBeenCalledWith(
      '',
      GENERATE_CONTENT_PLATFORM_ROUTES_EVENT,
      { generationId: '1' }
    )
  })

  it('emits NEITHER CMS source event when both flags are off (US-6 — backwards compatibility)', async () => {
    context.state.settings = {
      contentPlatformContentTypes: DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
      contentPlatformStoreId: DEFAULT_CONTENT_PLATFORM_STORE_ID,
      disableRoutesTerm: '',
      enableAppsRoutes: true,
      enableCmsRoutes: false,
      enableContentPlatformRoutes: false,
      enableNavigationRoutes: true,
      enableProductRoutes: true,
      ignoreBindings: false,
    }

    await generateSitemap(context)
    const cmsCall = eventSent.mock.calls.find(
      ([, event]) =>
        event === GENERATE_CMS_ROUTES_EVENT ||
        event === GENERATE_CONTENT_PLATFORM_ROUTES_EVENT
    )
    expect(cmsCall).toBeUndefined()
  })
})
