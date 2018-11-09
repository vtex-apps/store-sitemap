import * as cheerio from 'cheerio'
import { retry } from '../resources/retry'
import { isCanonical, Route } from '../resources/route'
import { getSiteMapXML } from '../resources/site'

const updateRouteList = async (ctx: ServiceContext, route: Route[]) => {
  if (route.length > 0) {
    return ctx.renderClient.post('/canonical', {entries: route})
  }
}

export const sitemap = async (ctx: ServiceContext) => {
  const {vtex: {account}} = ctx
  const forwardedHost = ctx.get('x-forwarded-host')
  const routeList: Route[] = []
  const {data: originalXML} = await getSiteMapXML(ctx)
  const normalizedXML = originalXML.replace(new RegExp(`${account}.vtexcommercestable.com.br`, 'g'), forwardedHost)
  const $ = cheerio.load(normalizedXML, {
    decodeEntities: false,
    xmlMode: true,
  })
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
    .catch(err => {
      console.error(err)
      if (err.response) {
        ctx.logger.error(err, {message: 'Could not update route list'})
        return
      }
    })
  }

  ctx.set('Content-Type', 'text/xml')
  ctx.body = $.xml()
  ctx.status = 200
}
