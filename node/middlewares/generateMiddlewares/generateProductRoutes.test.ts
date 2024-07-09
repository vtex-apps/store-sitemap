import {
  CatalogGraphQL,
  IOContext,
  Logger,
  RequestConfig,
  RequestTracingConfig,
  Tenant,
  TenantClient,
  VBase,
  VBaseSaveResponse
} from '@vtex/api'
import { Product } from '@vtex/api/lib/clients/apps/catalogGraphQL/product'
import * as TypeMoq from 'typemoq'
import { TranslateArgs } from 'vtex.messages'

import { Clients } from '../../clients'
import { Messages } from '../../clients/messages'
import { getBucket, hashString } from '../../utils'
import { Catalog, GetProductsAndSkuIdsReponse } from './../../clients/catalog'
import { GraphQLServer, ProductNotFound } from './../../clients/graphqlServer'
import { STORE_PRODUCT } from './../../utils'
import { generateProductRoutes } from './generateProductRoutes'
import {
  GENERATE_PRODUCT_ROUTES_EVENT,
  GROUP_ENTRIES_EVENT,
  initializeSitemap,
  PRODUCT_ROUTES_INDEX,
  RAW_DATA_PREFIX,
  SitemapEntry,
  SitemapIndex,
} from './utils'


const tenantTypeMock = TypeMoq.Mock.ofInstance(TenantClient)
const messagesTypeMock = TypeMoq.Mock.ofInstance(Messages)
const graphqlServerTypeMock = TypeMoq.Mock.ofInstance(GraphQLServer)
const catalogTypeMock = TypeMoq.Mock.ofInstance(Catalog)
const catalogGraphQLTypeMock = TypeMoq.Mock.ofInstance(CatalogGraphQL)
const vbaseTypeMock = TypeMoq.Mock.ofInstance(VBase)
const contextMock = TypeMoq.Mock.ofType<EventContext>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()


let next: any
let tenantInfo = {
  bindings: [
  {
    defaultLocale: 'en-US',
    extraContext: {
      portal: {
        salesChannel: '1',
      },
    },
    id: '1',
    targetProduct: STORE_PRODUCT,
  },
  {
      defaultLocale: 'pt-BR',
      extraContext: {
        portal: {
          salesChannel: '1',
        },
      },
      id: '2',
      targetProduct: STORE_PRODUCT,
    },
  ] as any,
  defaultLocale: 'en-US',
}

describe('Test product routes generation', () => {
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
    ): Promise<VBaseSaveResponse> => {
      if (!this.jsonData[bucket]) {
        this.jsonData[bucket] = {}
      }
      this.jsonData[bucket][file] = data
      return Promise.resolve({}) as Promise<VBaseSaveResponse>
    }
  }

  // tslint:disable-next-line:max-classes-per-file
  const tenant = class TenantMock extends tenantTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public info = async (_?: RequestConfig) => {
      return tenantInfo as Tenant
    }
  }

  // tslint:disable-next-line:max-classes-per-file
  const catalog = class CatalogMock extends catalogTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public getProductsIds = async (page: number) => {
      switch (page) {
        case 2:
          return {
            items: [4, 5, 6],
            paging: { pages: 2, total: 51 },
          } as unknown as GetProductsAndSkuIdsReponse
        default:
          return {
            items: [1, 2, 3],
            paging: { pages: 2, total: 51 },
          } as unknown as GetProductsAndSkuIdsReponse
      }
    }
  }

  // tslint:disable-next-line:max-classes-per-file
  const catalogGraphQL = class CatalogGraphQLMock extends catalogGraphQLTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public product = async (productId: string, _?: RequestTracingConfig) => {
      let product
      switch (productId) {
        case '1':
          product = {
            id: '1',
            isActive: true,
            linkId: 'banana',
            salesChannel: [{ id: '1' }],
          }
          break
        case '2':
          product = {
            id: '2',
            isActive: false,
            linkId: 'inactive-banana',
            salesChannel: [{ id: '1' }],
          }
          break
        case '3':
          product = {
            id: '3',
            isActive: true,
            linkId: 'apple',
            salesChannel: [{ id: '1' }],
          }
          break
        case '4':
          product = {
            id: '4',
            isActive: true,
            linkId: 'watermelon',
            salesChannel: [{ id: '1' }],
          }
          break
        case '5':
          product = {
            id: '5',
            isActive: true,
            linkId: 'pinnaple',
            salesChannel: [{ id: '1' }],
          }
          break
        default:
          product = undefined
          break
      }
      return {
        product: product as unknown as Product,
      }
    }
  }

  // tslint:disable-next-line:max-classes-per-file
  const graphqlServer = class GraphqlServerMock extends graphqlServerTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public query =  async (_: string, variables: any, __: any) => {
      if (variables.identifier.value === '3') {
        throw new ProductNotFound([])
      }
      return 'something-not-null' as any
    }
  }

  // tslint:disable-next-line:max-classes-per-file
  const messages = class MessagesMock extends messagesTypeMock.object {
      constructor() {
        super(ioContext.object)
      }

      public translateNoCache = async (args: TranslateArgs) => {
        return args.indexedByFrom[0].messages.map(({ content }: any) => content)
      }
    }



  beforeEach(() => {
    // tslint:disable-next-line:max-classes-per-file
    const ClientsImpl = class ClientsMock extends Clients {
      get vbase() {
        return this.getOrSet('vbase', vbase)
      }

      get catalog() {
        return this.getOrSet('catalog', catalog)
      }

      get catalogGraphQL() {
        return this.getOrSet('catalogGraphQL', catalogGraphQL)
      }

      get messages() {
        return this.getOrSet('messages', messages)
      }

      get graphqlServer() {
        return this.getOrSet('graphqlServer', graphqlServer)
      }

      get tenant() {
        return this.getOrSet('tenant', tenant)
      }
    }
    context = {
      ...contextMock.object,
      body: {
        generationId: '1',
        invalidProducts: 0,
        page: 1,
        processedProducts: 0,
      },
      clients: new ClientsImpl({}, ioContext.object),
      state: {
        ...state.object,
      },
      vtex: {
        ...ioContext.object,
        logger: loggerMock.object,
      },
    }
    next = jest.fn()
  })

   it('Next event is sent', async () => {
     await generateProductRoutes(context, next)
     expect(next).toBeCalled()
     const { event, payload } = context.state.nextEvent
     expect(event).toEqual(GENERATE_PRODUCT_ROUTES_EVENT)
     expect((payload as any).page).toEqual(2)
   })

  it('Complete event is sent', async () => {
    const thisContext = {
      ...context,
      body: {
        ...context.body,
        page: 2,
      },
    }
    await initializeSitemap(thisContext, PRODUCT_ROUTES_INDEX)
    await generateProductRoutes(thisContext, next)
    expect(next).toBeCalled()
    expect(context.state.nextEvent).toStrictEqual({
      event: GROUP_ENTRIES_EVENT,
      payload: { from: 0, generationId: '1', indexFile: 'productRoutesIndex.json' },
    })
  })

  it('Routes were saved', async () => {
    await generateProductRoutes(context, next)
    const { vbase: vbaseClient } = context.clients
    const bucket = getBucket(RAW_DATA_PREFIX, hashString('1'))
    const { index } = await vbaseClient.getJSON<SitemapIndex>(bucket, PRODUCT_ROUTES_INDEX, true)
    const expectedIndex = ['product-1']
    expect(index).toStrictEqual(expectedIndex)
    const { routes } = await vbaseClient.getJSON<SitemapEntry>(bucket, expectedIndex[0])
    expect(routes).toStrictEqual([
      {
        alternates: [
          { bindingId: '1', path: '/banana/p' },
          { bindingId: '2', path: '/banana/p' },
        ],
        id: '1',
        path: '/banana/p',
      },
    ])
  })

  it('Checks binding without SC case', async () => {
    tenantInfo = {
      bindings: [
        {
          defaultLocale: 'en-US',
          extraContext: {},
          id: '1',
          targetProduct: STORE_PRODUCT,
        },
      ],
      defaultLocale: 'en-US',
    } as Tenant
    await generateProductRoutes(context, next)
    const { vbase: vbaseClient } = context.clients
    const bucket = getBucket(RAW_DATA_PREFIX, hashString('1'))
    const { index } = await vbaseClient.getJSON<SitemapIndex>(bucket, PRODUCT_ROUTES_INDEX, true)
    const expectedIndex = ['product-1']
    expect(index).toStrictEqual(expectedIndex)
    const { routes } = await vbaseClient.getJSON<SitemapEntry>(bucket, expectedIndex[0])
    expect(routes).toStrictEqual([
      {
        alternates: [
          { bindingId: '1', path: '/banana/p' },
        ],
        id: '1',
        path: '/banana/p',
      },
    ])
  })
})
