import { VBase } from '@vtex/api'
import * as cheerio from 'cheerio'
import RouteParser from 'route-parser'

import { Internal } from '../clients/rewriter'
import { SITEMAP_URL, SitemapNotFound } from '../resources/utils'
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
  lang: string,
  entry: string,
  lastUpdated: string
) =>
  `<sitemap>
      <loc>https://${forwardedHost}${rootPath}/_v/public/newsitemap/${lang}/${entry}.xml</loc>
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
  lang: string,
  bucket: string
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
      sitemapIndexEntry(forwardedHost, rootPath, lang, entry, lastUpdated)
    )
  )
  return $
}

export async function sitemap(ctx: Context) {
  const {
    vtex: { production },
    clients: { vbase, events },
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
  const { lang, path } = sitemapParams
  const bucket = `${SITEMAP_BUCKET}${lang}`

  let $: any
  if (path === 'sitemap.xml') {
    try {
      $ = await sitemapIndex(forwardedHost, rootPath, vbase, lang, bucket)
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
