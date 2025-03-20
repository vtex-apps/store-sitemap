import { Binding, IOContext, Logger, VBase } from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { Clients } from '../clients'
import { sitemapEntry, URLEntry } from './sitemapEntry'

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
        case 'file1':
          return ({
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
          } as unknown) as T
        default:
          return (null as unknown) as T
      }
    }
  }

  // tslint:disable-next-line:no-empty
  const next = async (): Promise<void> => {}

  const defaultRoute: Route = {
    id: '2',
    path: '/pear',
  }

  const defaultLastUpdated = '2019-12-04'

  beforeEach(() => {
    // tslint:disable-next-line: max-classes-per-file
    const ClientsImpl = class ClientsMock extends Clients {
      public get vbase() {
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
    expect(removeSpaces(context.body)).toStrictEqual(
      removeSpaces(
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
      )
    )
  })

  it('Should create a correct sitemap entry with localization', async () => {
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
    expect(removeSpaces(entry)).toStrictEqual(
      removeSpaces(
        `<url>
      <loc>https://host.com/pear</loc>
      <xhtml:link rel="alternate" hreflang="pt-BR" href="https://www.host.com/br/pera"/>
      <xhtml:link rel="alternate" hreflang="de-DE" href="https://www.host.com/de/brine"/>
      <lastmod>2019-12-04</lastmod>
     </url>`
      )
    )
  })

  it('Should create a correct sitemap entry with localization with binding address querystring', async () => {
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
    expect(removeSpaces(entry)).toStrictEqual(
      removeSpaces(
        `<url>
      <loc>https://host.com/pear?__bindingAddress=www.host.com/es</loc>
      <xhtml:link rel="alternate" hreflang="pt-BR" href="https://host.com/pera?__bindingAddress=www.host.com/br"/>
      <xhtml:link rel="alternate" hreflang="de-DE" href="https://host.com/brine?__bindingAddress=www.host.com/de"/>
      <lastmod>2019-12-04</lastmod>
     </url>`
      )
    )
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
    expect(removeSpaces(entry)).toStrictEqual(
      removeSpaces(
        `<url>
      <loc>https://host.com/es/pear</loc>
      <lastmod>2019-12-04</lastmod>
     </url>`
      )
    )
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
    expect(removeSpaces(entry)).toStrictEqual(
      removeSpaces(
        `<url>
      <loc>https://host.com/pear?__bindingAddress=www.host.com/es</loc>
      <lastmod>2019-12-04</lastmod>
     </url>`
      )
    )
  })

  it('Should create a correct sitemap entry with image path and title', async () => {
    const route: Route = {
      ...defaultRoute,
      imagePath: 'image',
      imageTitle: 'title',
    }
    const entry = URLEntry(context, route, defaultLastUpdated)
    expect(removeSpaces(entry)).toStrictEqual(
      removeSpaces(
        `<url>
      <image:image>
        <image:loc>image</image:loc>
        <image:title>title</image:title>
      </image:image>
      <loc>https://host.com/pear</loc>
      <lastmod>2019-12-04</lastmod>
     </url>`
      )
    )
  })
})
