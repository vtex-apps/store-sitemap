import * as cheerio from 'cheerio'
import { forEach } from 'ramda'

import { sitemapClientFromCtx } from '../clients/sitemap'
import { isCanonical, Route } from '../resources/route'

const TEN_MINUTES_S = 10 * 60
const BLACK_LIST_TERMS = ['specificationFilter_']

export async function sitemap (ctx: Context) {
  const { vtex: { production }, clients: { canonicals, logger } } = ctx
  const sitemapClient = sitemapClientFromCtx(ctx)
  const forwardedHost = ctx.get('x-forwarded-host')
  let rootPath = ctx.get('x-vtex-root-path')
  // Defend against malformed root path. It should always start with `/`.
  if (rootPath && !rootPath.startsWith('/')) {
    rootPath = `/${rootPath}`
  }
  const [forwardedPath] = ctx.get('x-forwarded-path').split('?')

  const originalXML = await sitemapClient.fromLegacy(forwardedPath)
  const normalizedXML = sitemapClient.replaceHost(originalXML, forwardedHost, rootPath)

  const $ = cheerio.load(normalizedXML, {
    decodeEntities: false,
    xmlMode: true,
  })

  if (forwardedPath === '/sitemap.xml') {
    await sitemapClient.appendSitemapItems($('sitemapindex'), [
      `https://${forwardedHost}${rootPath}/sitemap/sitemap-custom.xml`,
      `https://${forwardedHost}${rootPath}/sitemap/sitemap-user-routes.xml`,
    ])
  }

  const routeList: Route[] = []
  const canonical = isCanonical(ctx)
  $('loc').each((_: any, loc: any) => {
    const canonicalUrl = $(loc).text()
    if (canonical) {
      routeList.push(new Route(ctx, canonicalUrl))
    }else{
      const shouldRemove = BLACK_LIST_TERMS.some((term) => canonicalUrl.indexOf(term) !== -1)
      if(shouldRemove){
        $(loc.parentNode).remove()
      }
    }
  })

  forEach((route: Route) => canonicals.save(route).catch((err: any) => logger.error(err)), routeList)

  ctx.set('Content-Type', 'text/xml')
  ctx.body = $.xml()
  ctx.status = 200
  ctx.set('cache-control', production ? `public, max-age=${TEN_MINUTES_S}`: 'no-cache')
}
