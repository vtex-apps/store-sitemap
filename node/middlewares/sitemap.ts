import * as cheerio from 'cheerio'
import { retry } from '../resources/retry'
import { isCanonical, Route } from '../resources/route'
import { getSiteMapXML } from '../resources/site'
import { getCurrentDate } from '../resources/utils'

const updateRouteList = async (ctx: Context, route: Route[]) => {
  if (route.length > 0) {
    return ctx.renderClient.post('/canonical', {entries: route})
  }
}

const xmlSitemapItem = (loc: string) => {
  return `
  <sitemap>
    <loc>${loc}</loc>
    <lastmod>${getCurrentDate()}</lastmod>
  </sitemap>`
}

export const sitemap = async (ctx: Context) => {
  const {vtex: {account}} = ctx
  const forwardedHost = ctx.get('x-forwarded-host')
  const [forwardedPath] = ctx.get('x-forwarded-path').split('?')
  const routeList: Route[] = []
  const {data: originalXML} = await getSiteMapXML(ctx)
  const normalizedXML = originalXML.replace(new RegExp(`${account}.vtexcommercestable.com.br`, 'g'), forwardedHost)
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
  const canonical = isCanonical(ctx)

  $('loc').each((_, loc) => {
    const canonicalUrl = $(loc).text()
    if (canonical) {
      const route = new Route(ctx, canonicalUrl)
      routeList.push(route)
    }
  })

  if (routeList.length > 0) {
    retry(updateRouteList.bind(null, ctx, routeList))
    .catch((err: Error) => {
      console.error(err)
      ctx.logger.error(err, {message: 'Could not update route list'})
      return
    })
  }

  ctx.set('Content-Type', 'text/xml')
  ctx.body = $.xml()
}
