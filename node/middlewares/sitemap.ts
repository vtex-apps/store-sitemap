import { Binding, VBase } from '@vtex/api'
import * as cheerio from 'cheerio'
import RouteParser from 'route-parser'

import {
  hashString,
  currentDate,
  getStoreBindings,
  SITEMAP_URL,
  SitemapNotFound,
} from '../resources/utils'
import { Internal } from '../clients/rewriter'
import { BindingResolver } from '../resources/bindings'
import {
  GENERATE_SITEMAP_EVENT,
  SITEMAP_BUCKET,
  SITEMAP_INDEX,
  SitemapEntry,
  SitemapIndex,
} from './generateSitemap'

const ONE_DAY_S = 24 * 60 * 60

const sitemapIndexEntry = (
  forwardedHost: string,
  rootPath: string,
  entry: string,
  lastUpdated: string,
  bindingIdentifier?: string
) => {
  const bindingSegment = bindingIdentifier ? `${bindingIdentifier}/` : ''
  return `<sitemap>
      <loc>https://${forwardedHost}${rootPath}/${bindingSegment}sitemap/${entry}.xml</loc>
      <lastmod>${lastUpdated}</lastmod>
    </sitemap>`
}

const sitemapBindingEntry = (
  forwardedHost: string,
  rootPath: string,
  lastUpdated: string,
  bindingIdentifier: string
) =>
  `<sitemap>
      <loc>https://${forwardedHost}${rootPath}/${bindingIdentifier}sitemap/sitemap.xml</loc>
      <lastmod>${lastUpdated}</lastmod>
    </sitemap>`

const URLEntry = (
  forwardedHost: string,
  rootPath: string,
  route: Internal,
  lastUpdated: string
): string => {
  let entry = `
      <loc>https://${forwardedHost}${rootPath}${route.from}</loc>
      <lastmod>${lastUpdated}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.4</priority>
    `
  if (route.imagePath && route.imageTitle) {
    // add image metainfo
    entry = `
    <image:image>
      <image:loc>${route.imagePath}</image:loc>
      <image:title>${route.imageTitle}</image:title>
    </image:image>
    ${entry}`
  }
  return `<url>${entry}</url>`
}

const sitemapIndex = async (
  forwardedHost: string,
  rootPath: string,
  vbase: VBase,
  bucket: string,
  bindingIdentifier?: string
) => {
  const $ = cheerio.load(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    {
      xmlMode: true,
    }
  )

  const indexData = await vbase.getJSON<SitemapIndex>(
    bucket,
    SITEMAP_INDEX,
    true
  )

  if (!indexData) {
    throw new SitemapNotFound('Sitemap not found')
  }
  const { index, lastUpdated } = indexData as SitemapIndex
  index.forEach(entry =>
    $('sitemapindex').append(
      sitemapIndexEntry(
        forwardedHost,
        rootPath,
        entry,
        lastUpdated,
        bindingIdentifier
      )
    )
  )
  return $
}

const sitemapBindingIndex = async (
  forwardedHost: string,
  rootPath: string,
  bindings: Binding[]
) => {
  const $ = cheerio.load(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    {
      xmlMode: true,
    }
  )

  const date = currentDate()
  const bindingsIdentifiers: string[] = [] // await Promise.all(bindings.map(getIdentifer)
  bindingsIdentifiers.forEach(bindingIdentifier =>
    $('sitemapindex').append(
      sitemapBindingEntry(forwardedHost, rootPath, date, bindingIdentifier)
    )
  )
  return $
}

export async function sitemap(ctx: Context) {
  const {
    vtex: { production },
    clients: { vbase, events, tenant },
  } = ctx
  const forwardedHost = ctx.get('x-forwarded-host')
  let rootPath = ctx.get('x-vtex-root-path')
  // Defend against malformed root path. It should always start with `/`.
  if (rootPath && !rootPath.startsWith('/')) {
    rootPath = `/${rootPath}`
  }
  const [forwardedPath] = ctx.get('x-forwarded-path').split('?')
  const sitemapRoute = new RouteParser(SITEMAP_URL)
  const sitemapParams = sitemapRoute.match(forwardedPath)
  if (!sitemapParams) {
    ctx.status = 404
    ctx.body = `Sitemap not found the URL must be: ${SITEMAP_URL}`
    throw new Error(`URL differs from the expected, ${forwardedPath}`)
  }
  const { bindingIdentifier, path } = sitemapParams

  const storeBindinigs = await getStoreBindings(tenant)
  const hasMultipleStoreBindings = storeBindinigs.length > 1
  const bindingResolver = new BindingResolver()
  const bucket = hasMultipleStoreBindings
    ? `${hashString((await bindingResolver.discoverId(ctx)) as string)}`
    : SITEMAP_BUCKET

  let $: any
  if (path === 'sitemap.xml') {
    try {
      if (bindingIdentifier) {
        $ = await sitemapIndex(
          forwardedHost,
          rootPath,
          vbase,
          bucket,
          bindingIdentifier
        )
      } else {
        $ = hasMultipleStoreBindings
          ? await sitemapBindingIndex(forwardedHost, rootPath, storeBindinigs)
          : await sitemapIndex(forwardedHost, rootPath, vbase, bucket)
      }
    } catch (err) {
      if (err instanceof SitemapNotFound) {
        ctx.status = 404
        ctx.body = 'Generating sitemap...'
        ctx.vtex.logger.error(err.message)
        return
      }
    }
  } else {
    $ = cheerio.load(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
      {
        xmlMode: true,
      }
    )
    const fileName = path.split('.')[0]
    const maybeRoutesInfo = await vbase.getJSON<SitemapEntry>(
      bucket,
      fileName,
      true
    )
    if (!maybeRoutesInfo) {
      ctx.status = 404
      ctx.body = 'Sitemap entry not found'
      ctx.vtex.logger.error('Sitemap entry not found')
      return
    }
    const { routes, lastUpdated } = maybeRoutesInfo as SitemapEntry
    routes.forEach((route: Internal) => {
      $('urlset').append(URLEntry(forwardedHost, rootPath, route, lastUpdated))
    })
  }

  ctx.set('Content-Type', 'text/xml')
  ctx.body = $.xml()
  ctx.status = 200
  ctx.set(
    'cache-control',
    production ? `public, max-age=${ONE_DAY_S}` : 'no-cache'
  )
  if (production) {
    events.sendEvent('', GENERATE_SITEMAP_EVENT)
  }
}
