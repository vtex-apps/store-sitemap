import {
  Apps,
  IOContext,
  Logger,
  RequestConfig,
  Tenant,
  TenantClient,
  VBase
} from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { Clients } from '../../clients'
import { CONFIG_BUCKET, getBucket, hashString } from '../../utils'
import { } from './../../clients/rewriter'
import { generateAppsRoutes } from './generateAppsRoutes'
import { APPS_ROUTES_INDEX, DEFAULT_CONFIG, NAVIGATION_ROUTES_INDEX, SitemapEntry, SitemapIndex } from './utils'

const tenantTypeMock = TypeMoq.Mock.ofInstance(TenantClient)
const appsTypeMock = TypeMoq.Mock.ofInstance(Apps)
const vbaseTypeMock = TypeMoq.Mock.ofInstance(VBase)
const contextMock = TypeMoq.Mock.ofType<EventContext>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()


describe('Test rewriter routes generation', () => {
  let context: EventContext

  const vbase = class VBaseMock extends vbaseTypeMock.object {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private jsonData: Record<string, any> = {}

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
    ): Promise<void> => {
      if (!this.jsonData[bucket]) {
        this.jsonData[bucket] = {}
      }
      this.jsonData[bucket][file] = data
    }

    public deleteFile = async (bucket: string, file: string, _: any, __: any): Promise<any> => {
      this.jsonData[bucket][file] = undefined
      return
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
        },
        {
          id: '2',
        },
      ],
    } as Tenant
    }
  }

  // tslint:disable-next-line:max-classes-per-file
  const apps = class AppsMock extends appsTypeMock.object {
    private builds: Record<string, any> = {
      ['vtex.app1@1.0.0']: {
        entries: ['/entry-1', '/entry-2'],
      },
      ['vtex.app2@1.0.0']: {
        entries: ['/entry-3'],
      },
      ['vtex.app3@1.0.0']: {
      },
    }
    constructor() {
      super(ioContext.object)
    }

    public getAppsMetaInfos = () => {
      return [
        { id: 'vtex.app1@1.0.0' },
        { id: 'vtex.app2@1.0.0' },
        { id: 'vtex.app3@1.0.0' },
      ] as any
    }

    public getAppJSON = (app: string, _: string, __?: boolean) => {
      return this.builds[app]
    }

    public setBuild = (app: string, data: any) => {
      this.builds[app] = data
    }
  }

  beforeEach(() => {
    // tslint:disable-next-line:max-classes-per-file
    const ClientsImpl = class ClientsMock extends Clients {
      get vbase() {
        return this.getOrSet('vbase', vbase)
      }

      get apps() {
        return this.getOrSet('apps', apps)

      }

      get tenant() {
        return this.getOrSet('tenant', tenant)
      }
    }
    context = {
      body: {
        generationId: '1',
      },
      clients: new ClientsImpl({}, ioContext.object),
      ...contextMock.object,
      state: {
        ...state.object,
        enabledIndexFiles: [NAVIGATION_ROUTES_INDEX, APPS_ROUTES_INDEX],
      },
      vtex: {
        ...ioContext.object,
        logger: loggerMock.object,
      },
    }
  })

  it('Routes were saved', async () => {
    await generateAppsRoutes(context)
    const { vbase: vbaseClient } = context.clients
    const bucket = getBucket(DEFAULT_CONFIG.generationPrefix, hashString('1'))
    const { index } = await vbaseClient.getJSON<SitemapIndex>(bucket, APPS_ROUTES_INDEX, true)
    const expectedIndex = ['appsRoutes-0']
    expect(index).toStrictEqual(expectedIndex)
    const { routes: appsRoutes } = await vbaseClient.getJSON<SitemapEntry>(bucket, expectedIndex[0])
    expect(appsRoutes).toStrictEqual([
      { id: '/entry-1', path: '/entry-1' },
      { id: '/entry-2', path: '/entry-2' },
      { id: '/entry-3', path: '/entry-3' },
    ])

    const appsCompleteFile = await vbaseClient.getJSON(CONFIG_BUCKET, APPS_ROUTES_INDEX)
    expect(appsCompleteFile).toBe('OK')
  })

  it('Splits routes if too many saved', async () => {
    const { vbase: vbaseClient, } = context.clients
    const appsClient = context.clients.apps as any

    const tooManyRoutes = new Array(5000).fill('/entry-1')
    const appsMetaInfos = await appsClient.getAppsMetaInfos()
    appsClient.setBuild(appsMetaInfos[0].id, { entries: tooManyRoutes })

    await generateAppsRoutes(context)
    const bucket = getBucket(DEFAULT_CONFIG.generationPrefix, hashString('1'))
    const { index } = await vbaseClient.getJSON<SitemapIndex>(bucket, APPS_ROUTES_INDEX, true)
    const expectedIndex = ['appsRoutes-0', 'appsRoutes-1']
    expect(index).toStrictEqual(expectedIndex)

    const { routes: routes0} = await vbaseClient.getJSON<SitemapEntry>(bucket, expectedIndex[0])
    expect(routes0.length).toEqual(5000)

    const { routes: routes1 } = await vbaseClient.getJSON<SitemapEntry>(bucket, expectedIndex[1])
    expect(routes1.length).toEqual(1)
  })
})
