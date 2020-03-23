import { VBase } from '@vtex/api'
import * as cheerio from 'cheerio'
import { replace } from 'ramda'
import { Internal } from 'vtex.rewriter'

import {
  GENERATE_SITEMAP_EVENT,
  SITEMAP_BUCKET,
  SITEMAP_INDEX
} from './generateSitemap'

const ONE_DAY_S = 24 * 60 * 60

const sitemapIndexEntry = (
  forwardedHost: string,
  rootPath: string,
  entry: string,
  lastUpdated: string
) =>
  `<sitemap>
      <loc>https://${forwardedHost}${rootPath}/_v/public/newsitemap/${entry}.xml</loc>
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
  vbase: VBase
) => {
  const $ = cheerio.load(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    {
      xmlMode: true,
    }
  )

  const indexData = await vbase.getJSON<{
    index: string[];
    lastUpdated: string;
  }>(SITEMAP_BUCKET, SITEMAP_INDEX, true)

  if (!indexData) {
    throw new Error(
      'Sitemap not generated, you need to do that first <LINK TO DOC>'
    )
  }
  const { index, lastUpdated } = indexData
  index.forEach(entry =>
    $('sitemapindex').append(
      sitemapIndexEntry(forwardedHost, rootPath, entry, lastUpdated)
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

  let $: any
  if (forwardedPath === '/_v/public/newsitemap/sitemap.xml') {
    $ = await sitemapIndex(forwardedHost, rootPath, vbase)
  } else {
    $ = cheerio.load(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
      {
        xmlMode: true,
      }
    )
    const fileName = replace(
      /^\/_v\/public\/newsitemap\/(.+?)\.xml$/,
      '$1',
      forwardedPath
    )
    const maybeRoutesInfo = await vbase.getJSON<{ lastUpdated: string, routes: Internal[] }>(
      SITEMAP_BUCKET,
      fileName,
      true
    )
    if (!maybeRoutesInfo) {
      ctx.status = 404
      throw new Error('Sitemap entry not found')
    }
    const { routes, lastUpdated } = maybeRoutesInfo
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
