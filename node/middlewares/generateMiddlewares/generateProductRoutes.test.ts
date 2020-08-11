import {
  CatalogGraphQL,
  IOContext,
  Logger,
  RequestConfig,
  RequestTracingConfig,
  Tenant,
  TenantClient,
} from '@vtex/api'
import { Product } from '@vtex/api/lib/clients/apps/catalogGraphQL/product'
import * as TypeMoq from 'typemoq'
import { TranslateArgs } from 'vtex.messages'

import { Clients } from '../../clients'
import { Messages } from '../../clients/messages'
import { CVBase } from '../../clients/Vbase'
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
const vbaseTypeMock = TypeMoq.Mock.ofInstance(CVBase)
const contextMock = TypeMoq.Mock.ofType<EventContext>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()


let next: any

describe('Test product routes generation', () => {
  let context: EventContext

  const cVbase = class VBaseMock extends vbaseTypeMock.object {
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
      } as Tenant
    }
  }

  // tslint:disable-next-line:max-classes-per-file
  const catalog = class CatalogMock extends catalogTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public getProductsAndSkuIds = async (from: number, _: number, __?: string) => {
      switch (from) {
        case 50:
          return {
            data: {
              '5': [1, 2],
              '6': [10, 20],
            },
            range: { total: 51 },
          } as unknown as GetProductsAndSkuIdsReponse
        default:
          return {
            data: {
              '1': [1, 2],
              '2': [10, 20],
              '3': [100, 200],
              '4': [],
            },
            range: { total: 51 },
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
      get cVbase() {
        return this.getOrSet('cVbase', cVbase)
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
      body: {
        from: 0,
        generationId: '1',
        invalidProducts: 0,
        processedProducts: 0,
      },
      clients: new ClientsImpl({}, ioContext.object),
      ...contextMock.object,
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
     expect((payload as any).from).toEqual(50)
   })

  it('Complete event is sent', async () => {
    const thisContext = {
      ...context,
      body: {
        ...context.body,
        from: 50,
      },
    }
    await initializeSitemap(thisContext, PRODUCT_ROUTES_INDEX)
    await generateProductRoutes(thisContext, next)
    expect(next).toBeCalled()
    expect(context.state.nextEvent).toStrictEqual({
      event: GROUP_ENTRIES_EVENT,
      payload: { generationId: '1', indexFile: 'productRoutesIndex.json' },
    })
  })

  it('Routes were saved', async () => {
    await generateProductRoutes(context, next)
    const { cVbase: vbaseClient } = context.clients
    const bucket = getBucket(RAW_DATA_PREFIX, hashString('1'))
    const { index } = await vbaseClient.getJSON<SitemapIndex>(bucket, PRODUCT_ROUTES_INDEX, true)
    const expectedIndex = ['product-0']
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
})
