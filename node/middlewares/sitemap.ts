import * as cheerio from 'cheerio'
import { forEach } from 'ramda'

import { sitemapClientFromCtx } from '../clients/sitemap'
import { isCanonical, Route } from '../resources/route'
import { currentDate } from '../resources/utils'

const xmlSitemapItem = (loc: string) => `
  <sitemap>
    <loc>${loc}</loc>
    <lastmod>${currentDate()}</lastmod>
  </sitemap>
`

const TEN_MINUTES_S = 10 * 60

export const sitemap: Middleware = async (ctx: Context) => {
  const { vtex: { production }, clients: { canonicals, logger } } = ctx
  const sitemapClient = sitemapClientFromCtx(ctx)
  const forwardedHost = ctx.get('x-forwarded-host')
  const [forwardedPath] = ctx.get('x-forwarded-path').split('?')

  const originalXML = await sitemapClient.fromLegacy(forwardedPath)
  const normalizedXML = sitemapClient.replaceHost(originalXML, forwardedHost)

  const $ = cheerio.load(normalizedXML, {
    decodeEntities: false,
    xmlMode: true,
  })

  if (forwardedPath === '/sitemap.xml') {
    $('sitemapindex').append(
      xmlSitemapItem(`https://${forwardedHost}/sitemap/sitemap-custom.xml`),
      xmlSitemapItem(`https://${forwardedHost}/sitemap/sitemap-user-routes.xml`)
    )
  }

  const routeList: Route[] = []
  const canonical = isCanonical(ctx)
  $('loc').each((_, loc) => {
    const canonicalUrl = $(loc).text()
    if (canonical) {
      routeList.push(new Route(ctx, canonicalUrl))
    }
  })

  forEach((route: Route) => canonicals.save(route).catch(err => logger.error(err)), routeList)

  ctx.set('Content-Type', 'text/xml')
  ctx.body = $.xml()
  ctx.status = 200
  ctx.set('cache-control', production ? `public, max-age=${TEN_MINUTES_S}`: 'no-cache')
}
