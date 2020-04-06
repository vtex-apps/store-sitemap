import * as cheerio from 'cheerio'
import RouteParser from 'route-parser'

import { Internal } from '../clients/rewriter'
import { SITEMAP_URL } from '../utils'
import { SitemapEntry } from './generateSitemap'

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

export async function sitemapEntry(ctx: Context, next: () => Promise<void>) {
  const {
    state: { forwardedHost, forwardedPath, bucket, rootPath },
    clients: { vbase },
  } = ctx
  const sitemapRoute = new RouteParser(SITEMAP_URL)
  const sitemapParams = sitemapRoute.match(forwardedPath)
  if (!sitemapParams) {
    ctx.status = 404
    ctx.body = `Sitemap not found the URL must be: ${SITEMAP_URL}`
    throw new Error(`URL differs from the expected, ${forwardedPath}`)
  }
  const { path } = sitemapParams

  const $: any = cheerio.load(
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

  ctx.body = $.xml()
  next()
}
