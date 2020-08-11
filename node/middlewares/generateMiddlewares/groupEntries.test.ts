import { IOContext, Logger, RequestConfig, Tenant, TenantClient, VBase} from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { Clients } from '../../clients'
import {
  CONFIG_BUCKET,
  GENERATION_CONFIG_FILE,
  getBucket,
  hashString,
  STORE_PRODUCT
} from './../../utils'
import { groupEntries } from './groupEntries'
import {
  DEFAULT_CONFIG,
  PRODUCT_ROUTES_INDEX,
  RAW_DATA_PREFIX,
  REWRITER_ROUTES_INDEX,
  SitemapEntry,
  SitemapIndex
} from './utils'

const vbaseTypeMock = TypeMoq.Mock.ofInstance(VBase)
const contextMock = TypeMoq.Mock.ofType<EventContext>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()
const tenantTypeMock = TypeMoq.Mock.ofInstance(TenantClient)

const BANANA_PRODUCT_ROUTE = {
  alternates: [
    { bindingId: '1', path: '/banana/p' },
  ],
  id: '1',
  path: '/banana/p',
}

const APPLE_PRODUCT_ROUTE = {
  alternates: [
    { bindingId: '1', path: '/apple/p' },
  ],
  id: '2',
  path: '/apple/p',
}

describe('Test group entries', () => {
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
            targetProduct: STORE_PRODUCT,
          },
        ],
      } as Tenant
    }
  }

  beforeEach(() => {
    // tslint:disable-next-line:max-classes-per-file
    const ClientsImpl = class ClientsMock extends Clients {
      get vbase() {
        return this.getOrSet('vbase', vbase)
      }

      get tenant() {
        return this.getOrSet('tenant', tenant)
      }
    }

    jest.clearAllMocks()

    context = {
      clients: new ClientsImpl({}, ioContext.object),
      ...contextMock.object,
      state: {
        ...state.object,
        enabledIndexFiles: [REWRITER_ROUTES_INDEX, PRODUCT_ROUTES_INDEX],
      },
      vtex: {
        ...ioContext.object,
        logger: loggerMock.object,
      },
    }
    const rawBucket = getBucket(RAW_DATA_PREFIX, hashString('1'))
    const { cVbase: vbaseClient } = context.clients
    vbaseClient.saveJSON(rawBucket, PRODUCT_ROUTES_INDEX, { index: [] })
    vbaseClient.saveJSON(rawBucket, REWRITER_ROUTES_INDEX, { index: [] })
  })

  it('Should complete', async () => {
    const { cVbase: vbaseClient } = context.clients

    context.body = { indexFile: PRODUCT_ROUTES_INDEX }
    await groupEntries(context)

    let productCompleteFile = await vbaseClient.getJSON(CONFIG_BUCKET, PRODUCT_ROUTES_INDEX)
    expect(productCompleteFile).toBe('OK')

    context.body = { indexFile: REWRITER_ROUTES_INDEX }
    await groupEntries(context)

    productCompleteFile = await vbaseClient.getJSON(CONFIG_BUCKET, PRODUCT_ROUTES_INDEX, true)
    const rewriterCompleteFile = await vbaseClient.getJSON(CONFIG_BUCKET, REWRITER_ROUTES_INDEX, true)
    const configCompleteFile = await vbaseClient.getJSON(CONFIG_BUCKET, GENERATION_CONFIG_FILE, true)
    expect(productCompleteFile).toBeNull()
    expect(rewriterCompleteFile).toBeNull()
    expect(configCompleteFile).toBeNull()
  })

  it('Should complete if enabled files were processed', async () => {
    const { cVbase: vbaseClient } = context.clients
    context.state.enabledIndexFiles = [PRODUCT_ROUTES_INDEX]

    context.body = { indexFile: PRODUCT_ROUTES_INDEX }
    await groupEntries(context)

    const productCompleteFile = await vbaseClient.getJSON(CONFIG_BUCKET, PRODUCT_ROUTES_INDEX, true)
    let configCompleteFile = await vbaseClient.getJSON(CONFIG_BUCKET, GENERATION_CONFIG_FILE, true)
    expect(productCompleteFile).toBeNull()
    expect(configCompleteFile).toBeNull()


    context.body = { indexFile: REWRITER_ROUTES_INDEX }
    context.state.enabledIndexFiles = [REWRITER_ROUTES_INDEX]
    await groupEntries(context)

    const rewriterCompleteFile = await vbaseClient.getJSON(CONFIG_BUCKET, REWRITER_ROUTES_INDEX, true)
    configCompleteFile = await vbaseClient.getJSON(CONFIG_BUCKET, GENERATION_CONFIG_FILE, true)
    expect(rewriterCompleteFile).toBeNull()
    expect(configCompleteFile).toBeNull()
  })

  it('Should group data', async () => {
    const { cVbase: vbaseClient } = context.clients
    context.body = { indexFile: PRODUCT_ROUTES_INDEX }
    const { generationPrefix } = DEFAULT_CONFIG

    // Saves two product routes in different files
    const rawBucket = getBucket(RAW_DATA_PREFIX, hashString('1'))
    await vbaseClient.saveJSON(rawBucket, 'product-0', { routes: [BANANA_PRODUCT_ROUTE] })
    await vbaseClient.saveJSON(rawBucket, 'product-1', { routes: [APPLE_PRODUCT_ROUTE] })
    await vbaseClient.saveJSON(rawBucket, PRODUCT_ROUTES_INDEX, { index: ['product-0', 'product-1'] })

    await groupEntries(context)
    const bucket = getBucket(generationPrefix, hashString('1'))
    const { index } = await vbaseClient.getJSON<SitemapIndex>(bucket, PRODUCT_ROUTES_INDEX, true)
    const expectedIndex = ['product-0']
    expect(index).toStrictEqual(expectedIndex)
    const { routes } = await vbaseClient.getJSON<SitemapEntry>(bucket, expectedIndex[0])
    expect(routes).toStrictEqual([BANANA_PRODUCT_ROUTE, APPLE_PRODUCT_ROUTE])
  })

  it('Should create new file if one gets too big', async () => {
    const { cVbase: vbaseClient } = context.clients
    context.body = { indexFile: PRODUCT_ROUTES_INDEX }
    const { generationPrefix } = DEFAULT_CONFIG

    // Saves two product routes in different files
    const rawBucket = getBucket(RAW_DATA_PREFIX, hashString('1'))
    const tooManyRoutes = new Array(5001).fill(BANANA_PRODUCT_ROUTE)
    await vbaseClient.saveJSON(rawBucket, 'product-0', { routes: tooManyRoutes })
    await vbaseClient.saveJSON(rawBucket, PRODUCT_ROUTES_INDEX, { index: ['product-0'] })

    await groupEntries(context)

    const bucket = getBucket(generationPrefix, hashString('1'))
    const { index } = await vbaseClient.getJSON<SitemapIndex>(bucket, PRODUCT_ROUTES_INDEX, true)
    const expectedIndex = ['product-0', 'product-1']
    expect(index).toStrictEqual(expectedIndex)

    const { routes: routes0 } = await vbaseClient.getJSON<SitemapEntry>(bucket, expectedIndex[0])
    expect(routes0.length).toEqual(5000)

    const { routes: routes1 } = await vbaseClient.getJSON<SitemapEntry>(bucket, expectedIndex[1])
    expect(routes1.length).toEqual(1)
  })

})
