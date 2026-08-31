import { Binding, IOContext, Logger, VBase } from '@vtex/api'
import * as TypeMoq from 'typemoq'

import {
  APPS_ROUTES_INDEX,
  CMS_ROUTES_INDEX,
  CONTENT_PLATFORM_ROUTES_INDEX,
  PRODUCT_ROUTES_INDEX,
  REWRITER_ROUTES_INDEX,
} from './generateMiddlewares/utils'

import { Catalog } from '../clients/catalog'
import { Clients } from '../clients'
import {
  CMS_ROUTES_PREFIX,
  CONTENT_PLATFORM_ROUTES_PREFIX,
  EXTENDED_INDEX_FILE,
  getBucket,
  hashString,
} from '../utils'
import {
  DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
  DEFAULT_CONTENT_PLATFORM_STORE_ID,
} from './settings'
import { sitemap } from './sitemap'

const vbaseTypeMock = TypeMoq.Mock.ofInstance(VBase)
const catalogTypeMock = TypeMoq.Mock.ofInstance(Catalog)
const contextMock = TypeMoq.Mock.ofType<Context>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()

const removeSpaces = (str: string) => str.replace(/(\r\n|\n|\r|\s)/gm, '')

describe('Test sitemap middleware', () => {
  let context: Context
  let hasExtendedFiles: boolean
  let hasCmsRoutesFiles: boolean
  let hasContentPlatformRoutesFiles: boolean

  const cmsBucket = getBucket(CMS_ROUTES_PREFIX, hashString('1'))
  const contentPlatformBucket = getBucket(
    CONTENT_PLATFORM_ROUTES_PREFIX,
    hashString('1')
  )

  const vbase = class VBaseMock extends vbaseTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public getJSON = async <T>(
      bucket: string,
      file: string,
      __?: boolean | undefined
    ): Promise<T> => {
      if (file === CMS_ROUTES_INDEX && bucket === cmsBucket) {
        return ((hasCmsRoutesFiles
          ? {
              index: ['hcms-routes-0'],
              lastUpdated: '2019-12-04',
            }
          : null) as unknown) as T
      }
      if (
        file === CONTENT_PLATFORM_ROUTES_INDEX &&
        bucket === contentPlatformBucket
      ) {
        return ((hasContentPlatformRoutesFiles
          ? {
              index: ['cms-routes-0'],
              lastUpdated: '2019-12-04',
            }
          : null) as unknown) as T
      }
      switch (file) {
        case APPS_ROUTES_INDEX:
          return ({
            index: ['appsRoutes-0'],
            lastUpdated: '2019-12-04',
          } as unknown) as T
        case REWRITER_ROUTES_INDEX:
          return ({
            index: ['brand-0', 'department-0'],
            lastUpdated: '2019-12-04',
          } as unknown) as T
        case PRODUCT_ROUTES_INDEX:
          return ({
            index: ['product-0'],
            lastUpdated: '2019-12-04',
          } as unknown) as T
        case EXTENDED_INDEX_FILE:
          return ((hasExtendedFiles
            ? {
                index: ['extra-0'],
                lastUpdated: '2019-12-04',
              }
            : null) as unknown) as T
        default:
          return (null as unknown) as T
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
    hasCmsRoutesFiles = false
    hasContentPlatformRoutesFiles = false
    context = {
      ...contextMock.object,
      clients: new ClientsImpl({}, ioContext.object),
      state: {
        ...state.object,
        binding: {
          id: '1',
        } as Binding,
        bucket: 'bucket',
        enabledIndexFiles: [
          APPS_ROUTES_INDEX,
          REWRITER_ROUTES_INDEX,
          PRODUCT_ROUTES_INDEX,
        ],
        forwardedHost: 'www.host.com',
        forwardedPath: '/sitemap/file1.xml',
        isCrossBorder: true,
        matchingBindings: [matchingBindings[0]],
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

  it('Should return binding index if it has multiple bindings', async () => {
    const thisContext = {
      ...context,
      state: {
        ...context.state,
        matchingBindings,
      },
    }
    await sitemap(thisContext, next)
    expect(
      thisContext.body.includes(
        '<loc>https://www.host.com/sitemap.xml?__bindingAddress=www.host.com</loc>'
      )
    ).toBeTruthy()
    expect(
      thisContext.body.includes(
        '<loc>https://www.host.com/sitemap.xml?__bindingAddress=www.host.com/br</loc>'
      )
    ).toBeTruthy()
    expect(
      thisContext.body.includes(
        '<loc>https://www.host.com/sitemap.xml?__bindingAddress=www.host.com/de</loc>'
      )
    ).toBeTruthy()
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
    expect(
      thisContext.body.includes('<loc>https://www.host.com/sitemap.xml</loc>')
    ).toBeTruthy()
    expect(
      thisContext.body.includes(
        '<loc>https://www.host.com/br/sitemap.xml</loc>'
      )
    ).toBeTruthy()
    expect(
      thisContext.body.includes(
        '<loc>https://www.host.com/de/sitemap.xml</loc>'
      )
    ).toBeTruthy()
  })

  it('Should return index if it doesnt have multiple bindings', async () => {
    await sitemap(context, next)
    expect(removeSpaces(context.body)).toStrictEqual(
      removeSpaces(
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
      )
    )
  })

  it('Should return only enabled index', async () => {
    context.state.enabledIndexFiles = [APPS_ROUTES_INDEX, PRODUCT_ROUTES_INDEX]
    await sitemap(context, next)
    expect(removeSpaces(context.body)).toStrictEqual(
      removeSpaces(
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
      )
    )

    context.state.enabledIndexFiles = [
      REWRITER_ROUTES_INDEX,
      'non-existant-index',
    ]
    await sitemap(context, next)
    expect(removeSpaces(context.body)).toStrictEqual(
      removeSpaces(
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
      )
    )
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
    expect(removeSpaces(thisContext.body)).toStrictEqual(
      removeSpaces(
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
      )
    )
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
    expect(removeSpaces(thisContext.body)).toStrictEqual(
      removeSpaces(
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
      )
    )
  })

  it('Should return extra index if any', async () => {
    hasExtendedFiles = true
    await sitemap(context, next)
    expect(removeSpaces(context.body)).toStrictEqual(
      removeSpaces(
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
      )
    )
  })

  it('Should append hcms-routes sub-sitemaps to <sitemapindex> when enableCmsRoutes is on (US-1)', async () => {
    hasCmsRoutesFiles = true
    context.state.settings.enableCmsRoutes = true
    await sitemap(context, next)
    expect(context.body).toContain(
      '<loc>https://www.host.com/sitemap/hcms-routes-0.xml</loc>'
    )
  })

  it('Should NOT read or append hcms-routes when enableCmsRoutes is off (invariant 9)', async () => {
    hasCmsRoutesFiles = true
    context.state.settings.enableCmsRoutes = false
    await sitemap(context, next)
    expect(context.body).not.toContain('hcms-routes-0')
  })

  it('Should append cms-routes sub-sitemaps to <sitemapindex> when enableContentPlatformRoutes is on (US-1 — Content Platform)', async () => {
    hasContentPlatformRoutesFiles = true
    context.state.settings.enableContentPlatformRoutes = true
    await sitemap(context, next)
    expect(context.body).toContain(
      '<loc>https://www.host.com/sitemap/cms-routes-0.xml</loc>'
    )
  })

  it('Should NOT read cms-routes when its flag is off (invariant 9)', async () => {
    hasContentPlatformRoutesFiles = true
    context.state.settings.enableContentPlatformRoutes = false
    await sitemap(context, next)
    expect(context.body).not.toContain('cms-routes-0')
  })

  it('Should reference ONLY cms-routes (not hcms-routes) when both flags are on — Content Platform wins (US-6 / Decision 8)', async () => {
    hasCmsRoutesFiles = true
    hasContentPlatformRoutesFiles = true
    context.state.settings.enableCmsRoutes = true
    context.state.settings.enableContentPlatformRoutes = true
    await sitemap(context, next)
    expect(context.body).toContain(
      '<loc>https://www.host.com/sitemap/cms-routes-0.xml</loc>'
    )
    expect(context.body).not.toContain('hcms-routes-0')
  })

  it('Should reference hcms-routes (not cms-routes) when only enableCmsRoutes is on (Decision 8 — hCMS wins)', async () => {
    hasCmsRoutesFiles = true
    hasContentPlatformRoutesFiles = true
    context.state.settings.enableCmsRoutes = true
    context.state.settings.enableContentPlatformRoutes = false
    await sitemap(context, next)
    expect(context.body).toContain('hcms-routes-0')
    // Use full path to avoid 'hcms-routes-0' matching as a substring of 'cms-routes-0'
    expect(context.body).not.toContain('/sitemap/cms-routes-0.xml')
  })
})

describe('Test sitemap middleware — single-binding catalog path', () => {
  const catalogSitemapXml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap>
      <loc>https://www.host.com/sitemap/brand-0.xml</loc>
      <lastmod>2019-12-04</lastmod>
    </sitemap>
    <sitemap>
      <loc>https://www.host.com/sitemap/product-0.xml</loc>
      <lastmod>2019-12-04</lastmod>
    </sitemap>
  </sitemapindex>`

  const cmsBucket = getBucket(CMS_ROUTES_PREFIX, hashString('1'))
  const contentPlatformBucket = getBucket(
    CONTENT_PLATFORM_ROUTES_PREFIX,
    hashString('1')
  )

  let hasCmsRoutesFiles: boolean
  let hasContentPlatformRoutesFiles: boolean

  const vbase = class VBaseMock extends vbaseTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public getJSON = async <T>(
      bucket: string,
      file: string,
      __?: boolean | undefined
    ): Promise<T> => {
      if (file === CMS_ROUTES_INDEX && bucket === cmsBucket) {
        return ((hasCmsRoutesFiles
          ? {
              index: ['hcms-routes-0'],
              lastUpdated: '2019-12-04',
            }
          : null) as unknown) as T
      }
      if (
        file === CONTENT_PLATFORM_ROUTES_INDEX &&
        bucket === contentPlatformBucket
      ) {
        return ((hasContentPlatformRoutesFiles
          ? {
              index: ['cms-routes-0'],
              lastUpdated: '2019-12-04',
            }
          : null) as unknown) as T
      }
      return (null as unknown) as T
    }
  }

  const catalog = class CatalogMock extends catalogTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public getSitemap = async () => catalogSitemapXml
  }

  const next = jest.fn()

  const baseSettings = {
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

  const buildContext = (settings: typeof baseSettings): Context =>
    ({
      ...contextMock.object,
      clients: new (class ClientsMock extends Clients {
        get vbase() {
          return this.getOrSet('vbase', vbase)
        }

        get catalog() {
          return this.getOrSet('catalog', catalog)
        }
      })({}, ioContext.object),
      headers: {
        'x-forwarded-host': 'www.host.com',
      },
      state: {
        binding: { id: '1' } as Binding,
        forwardedHost: 'www.host.com',
        forwardedPath: 'sitemap.xml',
        isCrossBorder: false,
        rootPath: '',
        settings,
      },
      vtex: {
        ...ioContext.object,
        logger: loggerMock.object,
      },
    } as unknown as Context)

  beforeEach(() => {
    hasCmsRoutesFiles = false
    hasContentPlatformRoutesFiles = false
  })

  it('returns catalog XML unchanged when no CMS source is enabled', async () => {
    const ctx = buildContext(baseSettings)
    await sitemap(ctx, next)
    expect(removeSpaces(ctx.body)).toStrictEqual(removeSpaces(catalogSitemapXml))
    expect(ctx.body).not.toContain('hcms-routes-0')
    expect(ctx.body).not.toContain('cms-routes-0')
  })

  it('merges hcms-routes into catalog sitemapindex when enableCmsRoutes is on', async () => {
    hasCmsRoutesFiles = true
    const ctx = buildContext({ ...baseSettings, enableCmsRoutes: true })
    await sitemap(ctx, next)
    expect(ctx.body).toContain(
      '<loc>https://www.host.com/sitemap/brand-0.xml</loc>'
    )
    expect(ctx.body).toContain(
      '<loc>https://www.host.com/sitemap/hcms-routes-0.xml</loc>'
    )
  })

  it('merges content-platform-routes into catalog sitemapindex when enableContentPlatformRoutes is on', async () => {
    hasContentPlatformRoutesFiles = true
    const ctx = buildContext({
      ...baseSettings,
      enableContentPlatformRoutes: true,
    })
    await sitemap(ctx, next)
    expect(ctx.body).toContain(
      '<loc>https://www.host.com/sitemap/cms-routes-0.xml</loc>'
    )
    expect(ctx.body).not.toContain('hcms-routes-0')
  })

  it('merges only content-platform-routes when both CMS flags are on (Decision 8)', async () => {
    hasCmsRoutesFiles = true
    hasContentPlatformRoutesFiles = true
    const ctx = buildContext({
      ...baseSettings,
      enableCmsRoutes: true,
      enableContentPlatformRoutes: true,
    })
    await sitemap(ctx, next)
    expect(ctx.body).toContain(
      '<loc>https://www.host.com/sitemap/cms-routes-0.xml</loc>'
    )
    expect(ctx.body).not.toContain('hcms-routes-0')
  })
})
