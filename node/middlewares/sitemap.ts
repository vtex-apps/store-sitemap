import * as cheerio from 'cheerio'
import { forEach } from 'ramda'

import { isCanonical, Route } from '../resources/route'
import { currentDate } from '../resources/utils'
import { Context, Middleware } from '../utils/helpers'

const xmlSitemapItem = (loc: string) => `
  <sitemap>
    <loc>${loc}</loc>
    <lastmod>${currentDate()}</lastmod>
  </sitemap>
`

const TEN_MINUTES_S = 10 * 60

export const sitemap: Middleware = async (ctx: Context) => {
  const {vtex: {account, production}, dataSources: {sitemap: sitemapDataSource, canonicals}} = ctx
  const forwardedHost = ctx.get('x-forwarded-host')
  const originalXML = await sitemapDataSource.fromLegacy()
  const normalizedXML = originalXML.replace(new RegExp(`${account}.vtexcommercestable.com.br`, 'g'), forwardedHost)
  const $ = cheerio.load(normalizedXML, {
    decodeEntities: false,
    xmlMode: true,
  })
  if (ctx.url === '/sitemap.xml') {
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

  forEach(canonicals.save, routeList)

  ctx.set('Content-Type', 'text/xml')
  ctx.body = $.xml()
  ctx.status = 200
  ctx.set('cache-control', production ? `public, max-age=${TEN_MINUTES_S}`: 'no-cache')
}
