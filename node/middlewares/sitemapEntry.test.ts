import { Binding, IOContext, Logger, VBase } from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { Catalog } from '../clients/catalog'
import { Clients } from '../clients'
import {
  createMemoryVBaseMock,
  CmsActiveSettings,
  defaultCmsServingSettings,
} from '../test/fixtures/cmsTestFixtures'
import {
  CMS_ROUTES_PREFIX,
  CONTENT_PLATFORM_ROUTES_PREFIX,
  getBucket,
  hashString,
} from '../utils'
import {
  DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
  DEFAULT_CONTENT_PLATFORM_STORE_ID,
} from './settings'
import { sitemapEntry, URLEntry } from './sitemapEntry'

const vbaseTypeMock = TypeMoq.Mock.ofInstance(VBase)
const catalogTypeMock = TypeMoq.Mock.ofInstance(Catalog)
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
        case 'file1':
          return {
            lastUpdated: '2019-12-04',
            routes: [
            {
              id: 1,
              path: '/banana',
            },
            {
              id: 1,
              imagePath: 'image',
              imageTitle: 'title',
              path: '/watermelon',
            },
          ],
        } as unknown as T
        default:
          return null as unknown as T
      }
    }
  }

  // tslint:disable-next-line:no-empty
  const next = async (): Promise<void> => {
  }

  const defaultRoute: Route = {
    id: '2',
    path: '/pear',
  }

  const defaultLastUpdated = '2019-12-04'

  beforeEach(() => {
    // tslint:disable-next-line: max-classes-per-file
    const ClientsImpl = class ClientsMock extends Clients {
      get vbase() {
        return this.getOrSet('vbase', vbase)
      }
    }

    context = {
      ...contextMock.object,
      clients: new ClientsImpl({}, ioContext.object),
      state: {
        ...state.object,
        binding: {
          id: '1',
        } as Binding,
        bucket: 'bucket',
        forwardedHost: 'host.com',
        forwardedPath: '/sitemap/file1.xml',
        isCrossBorder: true,
        matchingBindings: [
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
        ] as Binding[],
        rootPath: '',
        settings: {
          contentPlatformContentTypes: DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
          contentPlatformStoreId: DEFAULT_CONTENT_PLATFORM_STORE_ID,
          disableRoutesTerm: '',
          enableAppsRoutes: true,
          enableCmsRoutes: false,
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

  it('Should return 404 when entry is not found', async () => {
    const thisContext = {
      ...context,
      state: {
        ...context.state,
        forwardedPath: '/sitemap/not-existent-file.xml',
      },
    }
    await sitemapEntry(thisContext, next)
    expect(thisContext.status).toStrictEqual(404)
  })

  it('Should return 404 when url does not match', async () => {
    const thisContext = {
      ...context,
      state: {
        ...context.state,
        forwardedPath: '/not-sitemap/not-existent-file.xml',
      },
    }
    await sitemapEntry(thisContext, next).catch(_ => null)
    expect(thisContext.status).toStrictEqual(404)
  })

  it('Should create corrects sitemap entries', async () => {
    await sitemapEntry(context, next)
    expect(removeSpaces(context.body)).toStrictEqual(removeSpaces(
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
        <url>
          <loc>https://host.com/banana</loc>
          <lastmod>2019-12-04</lastmod>
          </url><url>
          <image:image>
            <image:loc>image</image:loc>
            <image:title>title</image:title>
          </image:image>

          <loc>https://host.com/watermelon</loc>
          <lastmod>2019-12-04</lastmod>
        </url>
      </urlset>`
    ))
  })

  it('Should create a correct sitemap entry with localization (self + x-default per spec Decision 5)', async () => {
    const alternates: AlternateRoute[] = [
      {
        bindingId: '1',
        path: '/pear',
      },
      {
        bindingId: '2',
        path: '/pera',
      },
      {
        bindingId: '3',
        path: '/brine',
      },
    ]
    const route: Route = {
      ...defaultRoute,
      alternates,
    }
    const entry = URLEntry(context, route, defaultLastUpdated)
    expect(removeSpaces(entry)).toStrictEqual(removeSpaces(
    `<url>
      <loc>https://host.com/pear</loc>
      <xhtml:link rel="alternate" hreflang="en-US" href="https://host.com/pear"/>
      <xhtml:link rel="alternate" hreflang="pt-BR" href="https://www.host.com/br/pera"/>
      <xhtml:link rel="alternate" hreflang="de-DE" href="https://www.host.com/de/brine"/>
      <xhtml:link rel="alternate" hreflang="x-default" href="https://host.com/pear"/>
      <lastmod>2019-12-04</lastmod>
     </url>`
    ))
  })

  it('Should create a correct sitemap entry with localization with binding address querystring (self + x-default)', async () => {
    const alternates: AlternateRoute[] = [
      {
        bindingId: '1',
        path: '/pear',
      },
      {
        bindingId: '2',
        path: '/pera',
      },
      {
        bindingId: '3',
        path: '/brine',
      },
    ]
    const route: Route = {
      ...defaultRoute,
      alternates,
    }
    const thisContext = {
      ...context,
      state: {
        ...context.state,
        bindingAddress: 'www.host.com/es',
      },
    }
    const entry = URLEntry(thisContext, route, defaultLastUpdated)
    expect(removeSpaces(entry)).toStrictEqual(removeSpaces(
    `<url>
      <loc>https://host.com/pear?__bindingAddress=www.host.com/es</loc>
      <xhtml:link rel="alternate" hreflang="en-US" href="https://host.com/pear?__bindingAddress=www.host.com/es"/>
      <xhtml:link rel="alternate" hreflang="pt-BR" href="https://host.com/pera?__bindingAddress=www.host.com/br"/>
      <xhtml:link rel="alternate" hreflang="de-DE" href="https://host.com/brine?__bindingAddress=www.host.com/de"/>
      <xhtml:link rel="alternate" hreflang="x-default" href="https://host.com/pear?__bindingAddress=www.host.com/es"/>
      <lastmod>2019-12-04</lastmod>
     </url>`
    ))
  })

  it('Should emit no alternates for a single-binding store (US-3 negative case)', async () => {
    const alternates: AlternateRoute[] = [
      {
        bindingId: '1',
        path: '/pear',
      },
    ]
    const route: Route = {
      ...defaultRoute,
      alternates,
    }
    const singleBindingContext = {
      ...context,
      state: {
        ...context.state,
        matchingBindings: [
          {
            canonicalBaseAddress: 'www.host.com',
            defaultLocale: 'en-US',
            id: '1',
          },
        ] as any[],
      },
    }
    const entry = URLEntry(singleBindingContext, route, defaultLastUpdated)
    expect(entry).not.toContain('xhtml:link')
    expect(entry).not.toContain('x-default')
  })

  it('Should emit x-default pointing at the default binding even when current binding is not the default (US-3)', async () => {
    const alternates: AlternateRoute[] = [
      {
        bindingId: '1',
        path: '/pear',
      },
      {
        bindingId: '2',
        path: '/pera',
      },
      {
        bindingId: '3',
        path: '/brine',
      },
    ]
    const route: Route = {
      ...defaultRoute,
      alternates,
    }
    const ptBrCurrent = {
      ...context,
      state: {
        ...context.state,
        binding: { id: '2' } as any,
      },
    }
    const entry = URLEntry(ptBrCurrent, route, defaultLastUpdated)
    // self alternate uses forwardedHost
    expect(entry).toContain(
      '<xhtml:link rel="alternate" hreflang="pt-BR" href="https://host.com/pera"/>'
    )
    // x-default points at the FIRST matching binding (default), via its canonicalBaseAddress
    expect(entry).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://www.host.com/pear"/>'
    )
  })

  it('Should emit changefreq and priority tags when the route declares them (FR-5)', async () => {
    const route: Route = {
      ...defaultRoute,
      changefreq: 'daily',
      priority: 0.8,
    }
    const singleBindingContext = {
      ...context,
      state: {
        ...context.state,
        matchingBindings: [
          {
            canonicalBaseAddress: 'www.host.com',
            defaultLocale: 'en-US',
            id: '1',
          },
        ] as any[],
      },
    }
    const entry = URLEntry(singleBindingContext, route, defaultLastUpdated)
    expect(entry).toContain('<changefreq>daily</changefreq>')
    expect(entry).toContain('<priority>0.8</priority>')
  })

  it('Should NOT emit changefreq/priority when the route omits them (backwards compat invariant 7)', async () => {
    const singleBindingContext = {
      ...context,
      state: {
        ...context.state,
        matchingBindings: [
          {
            canonicalBaseAddress: 'www.host.com',
            defaultLocale: 'en-US',
            id: '1',
          },
        ] as any[],
      },
    }
    const entry = URLEntry(singleBindingContext, defaultRoute, defaultLastUpdated)
    expect(entry).not.toContain('<changefreq>')
    expect(entry).not.toContain('<priority>')
  })

  it('Should create a correct sitemap entry with root path', async () => {
    const thisContext = {
      ...context,
      state: {
        ...context.state,
        rootPath: '/es',
      },
    }
    const entry = URLEntry(thisContext, defaultRoute, defaultLastUpdated)
    expect(removeSpaces(entry)).toStrictEqual(removeSpaces(
    `<url>
      <loc>https://host.com/es/pear</loc>
      <lastmod>2019-12-04</lastmod>
     </url>`
    ))
  })

  it('Should create a correct sitemap entry with binding adress querystring', async () => {
    const thisContext = {
      ...context,
      state: {
        ...context.state,
        bindingAddress: 'www.host.com/es',
      },
    }
    const entry = URLEntry(thisContext, defaultRoute, defaultLastUpdated)
    expect(removeSpaces(entry)).toStrictEqual(removeSpaces(
    `<url>
      <loc>https://host.com/pear?__bindingAddress=www.host.com/es</loc>
      <lastmod>2019-12-04</lastmod>
     </url>`
    ))
  })

  it('Should create a correct sitemap entry with image path and title', async () => {
    const route: Route = {
      ...defaultRoute,
      imagePath: 'image',
      imageTitle: 'title',
    }
    const entry = URLEntry(context, route, defaultLastUpdated)
    expect(removeSpaces(entry)).toStrictEqual(removeSpaces(
    `<url>
      <image:image>
        <image:loc>image</image:loc>
        <image:title>title</image:title>
      </image:image>
      <loc>https://host.com/pear</loc>
      <lastmod>2019-12-04</lastmod>
     </url>`
    ))
  })

  describe('CMS-source bucket fallback (US-1 / US-6)', () => {
    const buildBucketAwareContext = (
      activeSettings: CmsActiveSettings,
      vbaseImpl: any
    ) =>
      ({
        ...contextMock.object,
        // tslint:disable-next-line:max-classes-per-file
        clients: new (class ClientsMock extends Clients {
          get vbase() {
            return this.getOrSet('vbase', vbaseImpl)
          }
        })({}, ioContext.object),
        state: {
          ...state.object,
          binding: { id: 'b1' } as Binding,
          bucket: 'production-bucket',
          forwardedPath: '/sitemap/cms-routes-0.xml',
          isCrossBorder: true,
          matchingBindings: [
            {
              canonicalBaseAddress: 'www.host.com',
              defaultLocale: 'en-US',
              id: 'b1',
            },
          ] as Binding[],
          rootPath: '',
          settings: defaultCmsServingSettings(activeSettings),
        },
        vtex: {
          ...ioContext.object,
          logger: loggerMock.object,
        },
      } as unknown) as Context

    it('falls back to the content-platform-routes bucket when serving /sitemap/cms-routes-N.xml (Decision 7)', async () => {
      const cpBucket = getBucket(CONTENT_PLATFORM_ROUTES_PREFIX, hashString('b1'))
      const VBaseMockClass = createMemoryVBaseMock(ioContext.object, {
        initialData: {
          [cpBucket]: {
            'cms-routes-0': {
              lastUpdated: '2026-05-20',
              routes: [
                {
                  id: 'lp-1',
                  path: '/our-story',
                  source: 'content-platform',
                },
              ],
            },
          },
        },
      })

      const ctx = buildBucketAwareContext(
        { enableCmsRoutes: false, enableContentPlatformRoutes: true },
        VBaseMockClass
      )
      await sitemapEntry(ctx, next)
      expect(ctx.body).toContain('<loc>https://undefined/our-story</loc>')
    })

    it('does NOT fall back to content-platform-routes bucket when its flag is off (invariant 9)', async () => {
      const cpBucket = getBucket(CONTENT_PLATFORM_ROUTES_PREFIX, hashString('b1'))
      const VBaseMockClass = createMemoryVBaseMock(ioContext.object, {
        initialData: {
          [cpBucket]: {
            'cms-routes-0': {
              lastUpdated: '2026-05-20',
              routes: [{ id: 'lp-1', path: '/our-story' }],
            },
          },
        },
      })

      const ctx = buildBucketAwareContext(
        { enableCmsRoutes: false, enableContentPlatformRoutes: false },
        VBaseMockClass
      )
      await sitemapEntry(ctx, next)
      expect(ctx.status).toBe(404)
    })

    it('falls back to cms-routes bucket (NOT content-platform) when hCMS wins (Decision 8)', async () => {
      const cmsBucket = getBucket(CMS_ROUTES_PREFIX, hashString('b1'))
      const VBaseMockClass = createMemoryVBaseMock(ioContext.object, {
        initialData: {
          [cmsBucket]: {
            'hcms-routes-0': {
              lastUpdated: '2026-05-20',
              routes: [{ id: 'cms-1', path: '/our-story-hcms' }],
            },
          },
        },
      })

      const ctx = buildBucketAwareContext(
        { enableCmsRoutes: true, enableContentPlatformRoutes: false },
        VBaseMockClass
      )
      ctx.state.forwardedPath = '/sitemap/hcms-routes-0.xml'
      await sitemapEntry(ctx, next)
      expect(ctx.body).toContain('our-story-hcms')
    })
  })

  describe('single-binding catalog path (US-1)', () => {
    const buildCatalogContext = (
      activeSettings: {
        enableCmsRoutes: boolean
        enableContentPlatformRoutes: boolean
      },
      vbaseImpl: any,
      catalogImpl: any,
      forwardedPath: string
    ) =>
      ({
        ...contextMock.object,
        clients: new (class ClientsMock extends Clients {
          get vbase() {
            return this.getOrSet('vbase', vbaseImpl)
          }

          get catalog() {
            return this.getOrSet('catalog', catalogImpl)
          }
        })({}, ioContext.object),
        headers: {
          'x-forwarded-host': 'www.host.com',
        },
        state: {
          ...state.object,
          binding: { id: 'b1' } as Binding,
          forwardedHost: 'www.host.com',
          forwardedPath,
          isCrossBorder: false,
          matchingBindings: [
            {
              canonicalBaseAddress: 'www.host.com',
              defaultLocale: 'en-US',
              id: 'b1',
            },
          ] as Binding[],
          rootPath: '',
          settings: {
            disableRoutesTerm: '',
            enableAppsRoutes: true,
            enableCmsRoutes: activeSettings.enableCmsRoutes,
            enableContentPlatformRoutes:
              activeSettings.enableContentPlatformRoutes,
            enableNavigationRoutes: true,
            enableProductRoutes: true,
            ignoreBindings: false,
          },
        },
        vtex: {
          ...ioContext.object,
          logger: loggerMock.object,
        },
      } as unknown) as Context

    it('serves hcms-routes from VBase before falling back to catalog proxy', async () => {
      const cmsBucket = getBucket(CMS_ROUTES_PREFIX, hashString('b1'))
      const vbaseImpl = class VBaseMock extends vbaseTypeMock.object {
        public jsonData: Record<string, Record<string, any>> = {
          [cmsBucket]: {
            'hcms-routes-0': {
              lastUpdated: '2026-05-20',
              routes: [{ id: 'cms-1', path: '/landing-page' }],
            },
          },
        }
        constructor() {
          super(ioContext.object)
        }
        public getJSON = async <T>(
          bucket: string,
          file: string,
          nullable?: boolean
        ): Promise<T> => {
          if (this.jsonData[bucket]?.[file]) {
            return this.jsonData[bucket][file] as T
          }
          if (nullable) {
            return (null as unknown) as T
          }
          return (null as unknown) as T
        }
      }
      const getSitemap = jest.fn(async () => 'catalog-xml')
      const catalogImpl = class CatalogMock extends catalogTypeMock.object {
        constructor() {
          super(ioContext.object)
        }
        public getSitemap = getSitemap
      }

      const ctx = buildCatalogContext(
        { enableCmsRoutes: true, enableContentPlatformRoutes: false },
        vbaseImpl,
        catalogImpl,
        '/sitemap/hcms-routes-0.xml'
      )
      await sitemapEntry(ctx, next)
      expect(ctx.body).toContain('<loc>https://www.host.com/landing-page</loc>')
      expect(getSitemap).not.toHaveBeenCalled()
    })

    it('falls back to catalog proxy when CMS file is not in VBase', async () => {
      const catalogXml = '<urlset><url><loc>https://www.host.com/p/1</loc></url></urlset>'
      const getSitemap = jest.fn(async () => catalogXml)
      const catalogImpl = class CatalogMock extends catalogTypeMock.object {
        constructor() {
          super(ioContext.object)
        }
        public getSitemap = getSitemap
      }
      const vbaseImpl = class VBaseMock extends vbaseTypeMock.object {
        constructor() {
          super(ioContext.object)
        }
        public getJSON = async <T>(): Promise<T> => (null as unknown) as T
      }

      const ctx = buildCatalogContext(
        { enableCmsRoutes: true, enableContentPlatformRoutes: false },
        vbaseImpl,
        catalogImpl,
        '/sitemap/product-0.xml'
      )
      await sitemapEntry(ctx, next)
      expect(getSitemap).toHaveBeenCalledWith(
        'www.host.com',
        '/sitemap/product-0.xml'
      )
      expect(ctx.body).toBe(catalogXml)
      expect(ctx.status).toBe(200)
    })

    it('does not read CMS bucket when enableCmsRoutes is off', async () => {
      const catalogXml = '<urlset><url><loc>https://www.host.com/p/1</loc></url></urlset>'
      const getSitemap = jest.fn(async () => catalogXml)
      let vbaseCalled = false
      const vbaseImpl = class VBaseMock extends vbaseTypeMock.object {
        constructor() {
          super(ioContext.object)
        }
        public getJSON = async <T>(
          _bucket: string,
          _file: string,
          nullable?: boolean
        ): Promise<T> => {
          vbaseCalled = true
          if (nullable) {
            return (null as unknown) as T
          }
          return (null as unknown) as T
        }
      }
      const catalogImpl = class CatalogMock extends catalogTypeMock.object {
        constructor() {
          super(ioContext.object)
        }
        public getSitemap = getSitemap
      }

      const ctx = buildCatalogContext(
        { enableCmsRoutes: false, enableContentPlatformRoutes: false },
        vbaseImpl,
        catalogImpl,
        '/sitemap/hcms-routes-0.xml'
      )
      await sitemapEntry(ctx, next)
      expect(vbaseCalled).toBe(false)
      expect(getSitemap).toHaveBeenCalled()
      expect(ctx.body).toBe(catalogXml)
    })
  })
})
