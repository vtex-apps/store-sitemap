import { Binding, IOContext, Logger, VBase } from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { APPS_ROUTES_INDEX, PRODUCT_ROUTES_INDEX, REWRITER_ROUTES_INDEX } from './generateMiddlewares/utils'

import { Clients } from '../clients'
import { EXTENDED_INDEX_FILE } from '../utils'
import { sitemap } from './sitemap'

const vbaseTypeMock = TypeMoq.Mock.ofInstance(VBase)
const contextMock = TypeMoq.Mock.ofType<Context>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()

const removeSpaces = (str: string) => str.replace(/(\r\n|\n|\r|\s)/gm, '')

describe('Test sitemap middleware', () => {
  let context: Context
  let hasExtendedFiles: boolean

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
        case APPS_ROUTES_INDEX:
          return {
            index: [ 'appsRoutes-0' ],
            lastUpdated: '2019-12-04',
          } as unknown as T
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
        case EXTENDED_INDEX_FILE:
          return (hasExtendedFiles
            ? {
              index: ['extra-0'],
              lastUpdated: '2019-12-04',
            }
            : null) as unknown as T
        default:
          return null as unknown as T
      }
    }
  }

  const next = jest.fn()

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

      hasExtendedFiles = false
      context = {
        ...contextMock.object,
        clients: new ClientsImpl({}, ioContext.object),
        state: {
          ...state.object,
          binding: {
            id: '1',
          } as Binding,
          bucket: 'bucket',
          enabledIndexFiles: [APPS_ROUTES_INDEX, REWRITER_ROUTES_INDEX, PRODUCT_ROUTES_INDEX],
          forwardedHost: 'www.host.com',
          forwardedPath: '/sitemap/file1.xml',
          matchingBindings: [
            matchingBindings[0],
          ],
          rootPath: '',
          settings: {
            enableAppsRoutes: true,
            enableNavigationRoutes: true,
            enableProductRoutes: true,
            disableDraftRoutes: false,
          },
        },
        vtex: {
          ...ioContext.object,
          logger: loggerMock.object,
        },
      }
    })

   it('Should return binding index if it has multiple bindings', async () => {
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

   it('Should return binding index with canonical if it has multiple bindings in production', async () => {
    const thisContext = {
      ...context,
      state: {
        ...context.state,
        matchingBindings,
      },
       vtex: {
         ...context.vtex,
         production: true,
       },
    }

    await sitemap(thisContext, next)
    expect(thisContext.body.includes(
      '<loc>https://www.host.com/sitemap.xml</loc>'
    )).toBeTruthy()
    expect(thisContext.body.includes(
      '<loc>https://www.host.com/br/sitemap.xml</loc>'
    )).toBeTruthy()
    expect(thisContext.body.includes(
      '<loc>https://www.host.com/de/sitemap.xml</loc>'
    )).toBeTruthy()
  })


    it('Should return index if it doesnt have multiple bindings', async () => {
      await sitemap(context, next)
      expect(removeSpaces(context.body)).toStrictEqual(removeSpaces(
        `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <sitemap>
            <loc>https://www.host.com/sitemap/appsRoutes-0.xml</loc>
            <lastmod>2019-12-04</lastmod>
          </sitemap>
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

  it('Should return only enabled index', async () => {
    context.state.enabledIndexFiles = [APPS_ROUTES_INDEX, PRODUCT_ROUTES_INDEX]
    await sitemap(context, next)
    expect(removeSpaces(context.body)).toStrictEqual(removeSpaces(
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <sitemap>
            <loc>https://www.host.com/sitemap/appsRoutes-0.xml</loc>
            <lastmod>2019-12-04</lastmod>
          </sitemap>
          <sitemap>
            <loc>https://www.host.com/sitemap/product-0.xml</loc>
            <lastmod>2019-12-04</lastmod>
          </sitemap>
        </sitemapindex>`
    ))

   context.state.enabledIndexFiles = [REWRITER_ROUTES_INDEX, 'non-existant-index']
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
        </sitemapindex>`
    ))
  })

  it('Should return binding index with bindingAddress', async () => {
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
          <loc>https://www.host.com/sitemap/appsRoutes-0.xml?__bindingAddress=www.host.com/en</loc>
          <lastmod>2019-12-04</lastmod>
        </sitemap>
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
          <loc>https://www.host.com/en/sitemap/appsRoutes-0.xml</loc>
          <lastmod>2019-12-04</lastmod>
        </sitemap>
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

  it('Should return extra index if any', async () => {
    hasExtendedFiles = true
    await sitemap(context, next)
    expect(removeSpaces(context.body)).toStrictEqual(removeSpaces(
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap>
          <loc>https://www.host.com/sitemap/appsRoutes-0.xml</loc>
          <lastmod>2019-12-04</lastmod>
        </sitemap>
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
        <sitemap>
          <loc>https://www.host.com/sitemap/extra-0.xml</loc>
          <lastmod>2019-12-04</lastmod>
        </sitemap>
      </sitemapindex>`
    ))
})

})
