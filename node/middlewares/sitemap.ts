import * as cheerio from 'cheerio'
import { Functions } from '@gocommerce/utils'
import { forEach } from 'ramda'

import { isCanonical, Route } from '../resources/route'
import { currentDate, baseDomain } from '../resources/utils'

const xmlSitemapItem = (loc: string) => `
  <sitemap>
    <loc>${loc}</loc>
    <lastmod>${currentDate()}</lastmod>
  </sitemap>
`

const TEN_MINUTES_S = 10 * 60

export const sitemap: Middleware = async (ctx: Context) => {
  const { vtex: { production, account, workspace }, clients: { sitemap: sitemapDataSource, canonicals, logger } } = ctx
  const forwardedHost = ctx.get('x-forwarded-host')
  const forwardedPath = ctx.get('x-forwarded-path')

  const originalXML = Functions.isGoCommerceAcc(account)
    ? await sitemapDataSource.fromLegacy(forwardedPath.replace('/', 'gc-'))
    : await sitemapDataSource.fromLegacy(forwardedPath)
  const normalizedXML = originalXML.replace(new RegExp(baseDomain(account, workspace), 'g'), forwardedHost)
  const $ = cheerio.load(normalizedXML, {
    decodeEntities: false,
    xmlMode: true,
  })

  if (ctx.url === '/sitemap.xml' && !Functions.isGoCommerceAcc(account)) {
    $('sitemapindex').append(
      xmlSitemapItem(`https://${forwardedHost}/sitemap-custom.xml`),
      xmlSitemapItem(`https://${forwardedHost}/sitemap-user-routes.xml`)
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
