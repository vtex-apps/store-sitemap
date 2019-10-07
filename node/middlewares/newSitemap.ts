import * as cheerio from 'cheerio'
import { forEach, keys, map, mergeAll, prop, range, replace } from 'ramda'

import { Internal, RouteIndexFileEntry } from '../clients/rewriter'
import { sitemapClientFromCtx } from '../clients/sitemap'
import { isCanonical, Route } from '../resources/route'
import { currentDate } from '../resources/utils'

const TEN_MINUTES_S = 10 * 60
const MAX_ROUTES_PER_REQUEST = 1
const BLACK_LIST_TERMS = ['specificationFilter_']

export async function oldSitemap (ctx: Context) {
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


export async function sitemap (ctx: Context) {
  const { vtex: { production }, clients: { rewriter } } = ctx
  const forwardedHost = ctx.get('x-forwarded-host')
  let rootPath = ctx.get('x-vtex-root-path')
  // Defend against malformed root path. It should always start with `/`.
  if (rootPath && !rootPath.startsWith('/')) {
    rootPath = `/${rootPath}`
  }
  const [forwardedPath] = ctx.get('x-forwarded-path').split('?')
  console.log(`forwardedPath: ` + forwardedPath)

  const indexArray = await rewriter.routesIndexFiles().then(prop('routeIndexFiles'))
  const indexTable = mergeAll(map((obj: RouteIndexFileEntry) => ({ [obj.fileName]: obj.fileSize }), indexArray))
  let $: any
  if (forwardedPath === '/sitemap.xml') {
    $ = cheerio.load('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', {
      xmlMode: true,
    })
    const indexTitles = keys(indexTable) as string[]
    console.log('these are the entities: ' + JSON.stringify(indexTitles))
    indexTitles.forEach((entity: string) => {
      const indexSize = indexTable[entity]
      if (indexSize <= MAX_ROUTES_PER_REQUEST) {
        $('sitemapindex').append(`
      <sitemap>
        <loc>https://${forwardedHost}${rootPath}/sitemap/${entity}.xml</loc>
        <lastmod>${currentDate()}</lastmod>
      </sitemap>
      `)
      } else {
        const indexBatches = map(
          x => [x*MAX_ROUTES_PER_REQUEST, (x+1)*MAX_ROUTES_PER_REQUEST-1],
          range(0, Math.floor(indexSize/MAX_ROUTES_PER_REQUEST))
        )
        indexBatches.forEach(([firstIndex, lastIndex]) => $('sitemapindex').append(`
      <sitemap>
        <loc>https://${forwardedHost}${rootPath}/sitemap/${entity}-${firstIndex}-${lastIndex}.xml</loc>
        <lastmod>${currentDate()}</lastmod>
      </sitemap>
      `))
      }
    })
  } else {
    $ = cheerio.load('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">', {
      xmlMode: true,
    })
    const [entity, startIndex=0, maybeLastIndex] = replace(/^\/sitemap\/(.+?)\.xml$/, '$1', forwardedPath).split('-')
    console.log('these are the guys:' + JSON.stringify([entity, startIndex, maybeLastIndex]))
    const lastIndex = maybeLastIndex ? Number(maybeLastIndex) : Number(indexTable[entity]) - 1
    const routes = await rewriter.listInternals(Number(startIndex), lastIndex as number, entity)
    console.log('these are the routes: ' + JSON.stringify(routes))
    routes.forEach((route: Internal) => $('urlset').append(`
        <url>
          <loc>https://${forwardedHost}/${rootPath}${route.from}</loc>
          <lastmod>${currentDate()}</lastmod>
          <changefreq>weekly</changefreq>
          <priority>0.4</priority>
        </url>
      `))
  }

  ctx.set('Content-Type', 'text/xml')
  ctx.body = $.xml()
  ctx.status = 200
  ctx.set('cache-control', production ? `public, max-age=${TEN_MINUTES_S}`: 'no-cache')
}
