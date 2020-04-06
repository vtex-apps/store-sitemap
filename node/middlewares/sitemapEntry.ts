import * as cheerio from 'cheerio'
import RouteParser from 'route-parser'

import { Internal } from '../clients/rewriter'
import { BindingResolver } from '../resources/bindings'
import { getStoreBindings, hashString, SITEMAP_URL } from '../utils'
import {
  GENERATE_SITEMAP_EVENT,
  SITEMAP_BUCKET,
  SitemapEntry,
} from './generateSitemap'

const ONE_DAY_S = 24 * 60 * 60

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

export async function sitemapEntry(ctx: Context) {
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
