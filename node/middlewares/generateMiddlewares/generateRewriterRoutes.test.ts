import { IOContext, Logger, RequestConfig, Tenant, TenantClient, VBase } from '@vtex/api'
import * as TypeMoq from 'typemoq'
import { EntityLocator, Internal } from 'vtex.rewriter'

import { Clients } from '../../clients'
import { getBucket, hashString } from '../../utils'
import { Rewriter } from './../../clients/rewriter'
import { generateRewriterRoutes } from './generateRewriterRoutes'
import {
  GENERATE_REWRITER_ROUTES_EVENT,
  GROUP_ENTRIES_EVENT,
  initializeSitemap,
  RAW_DATA_PREFIX,
  REWRITER_ROUTES_INDEX,
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
  const rewriter = class RewriterMock extends rewriterTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public routesById = async (_: EntityLocator) => {
      return []
    }

    public listInternals = async (_: number, cursor: Maybe<string>) => {
      switch(cursor) {
        case 'NEXT':
          return {
            next: null,
            routes: [
              {
                binding: '1',
                from: '/fruits',
                id: '1',
                type: 'department',
              },
              {
                binding: '1',
                from: '/coconut-water',
                id: '2',
                type: 'brand',
              },
            ] as Internal[],
          }
        default:
          return  {
            next: 'NEXT',
            routes: [
              {
                binding: '1',
                from: '/fruits/citrics',
                id: '3',
                type: 'category',
              },
              {
                binding: '1',
                from: '/market',
                id: '4',
                type: 'userRoute',
              },
              {
                binding: '1',
                disableSitemapEntry: true,
                from: '/banana-routes',
                id: '5',
                type: 'user-canonical',
              },
            ] as Internal[],
          }
      }
    }
  }

  beforeEach(() => {
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
    context = {
      ...contextMock.object,
      body: {
        count: 0,
        generationId: '1',
        next: null,
        report: {},
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
     await generateRewriterRoutes(context, next)
     expect(next).toBeCalled()
     expect(context.state.nextEvent).toStrictEqual({
        event: GENERATE_REWRITER_ROUTES_EVENT,
        payload: {
          count: 1,
          generationId: '1',
          next: 'NEXT',
          report: { category: 1, 'user-canonical': 1, userRoute: 1 },
        },
     })
   })

  it('Complete event is sent', async () => {
    const thisContext = {
      ...context,
      body: {
        ...context.body,
        count: 1,
        next: 'NEXT',
        report: { category: 1, userRoute: 1 },
      },
    }
    await initializeSitemap(thisContext, REWRITER_ROUTES_INDEX)
    await generateRewriterRoutes(thisContext, next)
    expect(next).toBeCalled()
    expect(context.state.nextEvent).toStrictEqual({
      event: GROUP_ENTRIES_EVENT,
      payload: { generationId: '1', indexFile: 'rewriterRoutesIndex.json' },
    }
    )
  })

  it('Routes were saved', async () => {
    await generateRewriterRoutes(context, next)
    const { vbase: vbaseClient } = context.clients
    const bucket = getBucket(RAW_DATA_PREFIX, hashString('1'))
    const { index } = await vbaseClient.getJSON<SitemapIndex>(bucket, REWRITER_ROUTES_INDEX, true)
    const expectedIndex = ['category-0', 'userRoute-0']
    expect(index).toStrictEqual(expectedIndex)
    const { routes: categoryRoutes } = await vbaseClient.getJSON<SitemapEntry>(bucket, expectedIndex[0])
    expect(categoryRoutes).toStrictEqual([
      {
        alternates: [],
        id: '3',
        imagePath: undefined,
        imageTitle: undefined,
        path: '/fruits/citrics',
      },
    ])
    const { routes: userRoutes } = await vbaseClient.getJSON<SitemapEntry>(bucket, expectedIndex[1])
    expect(userRoutes).toStrictEqual( [
      {
        alternates: [],
        id: '4',
        imagePath: undefined,
        imageTitle: undefined,
        path: '/market',
      },
    ])
  })
})
