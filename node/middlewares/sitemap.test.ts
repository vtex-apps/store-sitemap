import { Binding, IOContext, Logger, VBase } from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { PRODUCT_ROUTES_INDEX, REWRITER_ROUTES_INDEX } from './generateMiddlewares/utils';

import { Clients } from '../clients'
import { sitemap } from './sitemap'

const vbaseTypeMock = TypeMoq.Mock.ofInstance(VBase)
const contextMock = TypeMoq.Mock.ofType<Context>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()

const removeSpaces = (str: string) => str.replace(/(\r\n|\n|\r|\s)/gm, '')

describe('Test sitemap entry', () => {
  let context: Context


  const vbase = class VBaseMock extends vbaseTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public getJSON = async <T>(
      _: string,
      file: string,
      __?: boolean | undefined
    ): Promise<T> => {
      switch (file) {
        case REWRITER_ROUTES_INDEX:
          return {
            index: [ 'brand-0', 'department-0'],
            lastUpdated: '2019-12-04',
          } as unknown as T
        case PRODUCT_ROUTES_INDEX:
          return {
            index: [ 'product-0'],
            lastUpdated: '2019-12-04',
          } as unknown as T
        default:
          return null as unknown as T
      }
    }
  }

  // tslint:disable-next-line:no-empty
  const next = async (): Promise<void> => {
  }

  const matchingBindings = [
    {
      canonicalBaseAddress: 'www.host.com',
      defaultLocale: 'en-US',
      id: '1',
    },
    {
      canonicalBaseAddress: 'www.host.com/br',
      defaultLocale: 'pt-BR',
      id: '2',
    },
    {
      canonicalBaseAddress: 'www.host.com/de',
      defaultLocale: 'de-DE',
      id: '3',
    },
  ] as Binding[]

    beforeEach(() => {
      // tslint:disable-next-line: max-classes-per-file
      const ClientsImpl = class ClientsMock extends Clients {
        get vbase() {
          return this.getOrSet('vbase', vbase)
        }
      }

      context = {
        clients: new ClientsImpl({}, ioContext.object),
        ...contextMock.object,
        state: {
          ...state.object,
          binding: {
            id: '1',
          } as Binding,
          bucket: 'bucket',
          forwardedHost: 'www.host.com',
          forwardedPath: '/sitemap/file1.xml',
          matchingBindings: [
            matchingBindings[0],
          ],
          rootPath: '',
        },
        vtex: {
          ...ioContext.object,
          logger: loggerMock.object,
        },
      }
    })

   it('Should return binding index if it hasmultiple bindings', async () => {
     const thisContext = {
       ...context,
       state: {
         ...context.state,
         matchingBindings,
       },
     }
     await sitemap(thisContext, next)
     expect(thisContext.body.includes(
       '<loc>https://www.host.com/sitemap.xml?__bindingAddress=www.host.com</loc>'
     )).toBeTruthy()
     expect(thisContext.body.includes(
       '<loc>https://www.host.com/sitemap.xml?__bindingAddress=www.host.com/br</loc>'
     )).toBeTruthy()
     expect(thisContext.body.includes(
       '<loc>https://www.host.com/sitemap.xml?__bindingAddress=www.host.com/de</loc>'
     )).toBeTruthy()
   })

    it('Should return index if it doesnt have multiple bindings', async () => {
      await sitemap(context, next)
      expect(removeSpaces(context.body)).toStrictEqual(removeSpaces(
        `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <sitemap>
            <loc>https://www.host.com/sitemap/brand-0.xml</loc>
            <lastmod>2019-12-04</lastmod>
          </sitemap>
          <sitemap>
            <loc>https://www.host.com/sitemap/department-0.xml</loc>
            <lastmod>2019-12-04</lastmod>
          </sitemap>
          <sitemap>
            <loc>https://www.host.com/sitemap/product-0.xml</loc>
            <lastmod>2019-12-04</lastmod>
          </sitemap>
        </sitemapindex>`
      ))
  })

  it('Should return bindinig index with bindingAddress', async () => {
    const thisContext = {
      ...context,
      state: {
        ...context.state,
        bindingAddress: 'www.host.com/en',
      },
    }
    await sitemap(thisContext, next)
    expect(removeSpaces(thisContext.body)).toStrictEqual(removeSpaces(
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap>
          <loc>https://www.host.com/sitemap/brand-0.xml?__bindingAddress=www.host.com/en</loc>
          <lastmod>2019-12-04</lastmod>
        </sitemap>
        <sitemap>
          <loc>https://www.host.com/sitemap/department-0.xml?__bindingAddress=www.host.com/en</loc>
          <lastmod>2019-12-04</lastmod>
        </sitemap>
        <sitemap>
          <loc>https://www.host.com/sitemap/product-0.xml?__bindingAddress=www.host.com/en</loc>
          <lastmod>2019-12-04</lastmod>
        </sitemap>
      </sitemapindex>`
    ))
  })

  it('Should return bindinig index with rootPath', async () => {
    const thisContext = {
      ...context,
      state: {
        ...context.state,
        rootPath: '/en',
      },
    }
    await sitemap(thisContext, next)
    expect(removeSpaces(thisContext.body)).toStrictEqual(removeSpaces(
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap>
          <loc>https://www.host.com/en/sitemap/brand-0.xml</loc>
          <lastmod>2019-12-04</lastmod>
        </sitemap>
        <sitemap>
          <loc>https://www.host.com/en/sitemap/department-0.xml</loc>
          <lastmod>2019-12-04</lastmod>
        </sitemap>
        <sitemap>
          <loc>https://www.host.com/en/sitemap/product-0.xml</loc>
          <lastmod>2019-12-04</lastmod>
        </sitemap>
      </sitemapindex>`
    ))
  })
})