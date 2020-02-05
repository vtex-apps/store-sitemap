import * as cheerio from 'cheerio'
import { keys, map, mergeAll, prop, range, replace } from 'ramda'

import { Internal, RouteIndexFileEntry } from '../clients/rewriter'
import { currentDate } from '../resources/utils'

const MAX_ROUTES_PER_REQUEST = 100
const TEN_MINUTES_S = 10 * 60


const sitemapIndexEntry = (forwardedHost: string, rootPath: string, entity: string, firstIndex?: number, lastIndex?: number): string => {
  if (firstIndex != null && lastIndex != null) {
    return `
      <sitemap>
        <loc>https://${forwardedHost}${rootPath}/_v/public/newsitemap/${entity}-${firstIndex}-${lastIndex}.xml</loc>
        <lastmod>${currentDate()}</lastmod>
      </sitemap>
    `
  }
  return `
    <sitemap>
      <loc>https://${forwardedHost}${rootPath}/_v/public/newsitemap/${entity}.xml</loc>
      <lastmod>${currentDate()}</lastmod>
    </sitemap>
  `
}

const URLEntry = (forwardedHost: string, rootPath: string, route: Internal): string => {
  let entry = `
      <loc>https://${forwardedHost}${rootPath}${route.from}</loc>
      <lastmod>${currentDate()}</lastmod>
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
    ` + entry
  }
  return `<url>${entry}</url>`
}

export async function sitemap (ctx: Context) {
  const { vtex: { production }, clients: { rewriter, apps } } = ctx
  const forwardedHost = ctx.get('x-forwarded-host')
  let rootPath = ctx.get('x-vtex-root-path')
  // Defend against malformed root path. It should always start with `/`.
  if (rootPath && !rootPath.startsWith('/')) {
    rootPath = `/${rootPath}`
  }
  const [forwardedPath] = ctx.get('x-forwarded-path').split('?')

  const indexArray = await rewriter.routesIndexFiles().then(prop('routeIndexFiles'))
  const indexTable = mergeAll(map((obj: RouteIndexFileEntry) => ({ [obj.fileName]: obj.fileSize }), indexArray))
  let $: any
  if (forwardedPath === '/_v/public/newsitemap/sitemap.xml') {
    $ = cheerio.load('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', {
      xmlMode: true,
    })
    const indexTitles = keys(indexTable) as string[]
    console.log({indexTitles})
    for (const entity of indexTitles){
      const indexSize = indexTable[entity]
      if(entity.indexOf('notFoundProduct') !== -1){
        continue
      }
      if (indexSize <= MAX_ROUTES_PER_REQUEST) {
        $('sitemapindex').append(sitemapIndexEntry(forwardedHost, rootPath, entity))
      } else {
        range(0, Math.floor(indexSize/MAX_ROUTES_PER_REQUEST)).forEach(x => {
          const [firstIndex, lastIndex] = [x*MAX_ROUTES_PER_REQUEST, (x+1)*MAX_ROUTES_PER_REQUEST-1]
          $('sitemapindex').append(sitemapIndexEntry(forwardedHost, rootPath, entity, firstIndex, lastIndex))
        })
      }
    }
  } else {
    $ = cheerio.load('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">', {
      xmlMode: true,
    })
    const [entity, startIndex=0, maybeLastIndex] = replace(/^\/_v\/public\/newsitemap\/(.+?)\.xml$/, '$1', forwardedPath).split('-')
    const lastIndex = maybeLastIndex ? Number(maybeLastIndex) : Number(indexTable[entity]) - 1
    const today = new Date()
    const internals = await rewriter.listInternals(Number(startIndex), lastIndex as number, entity)
    internals.forEach((route: any) => { 
      if(route.declarer && route.declarer.indexOf('vtex.store') !== -1 && route.endDate && new Date(route.endDate) > today){
        const urlEntry = URLEntry(forwardedHost, rootPath, route)
        $('urlset').append(urlEntry)
      }
    })
  }

  ctx.set('Content-Type', 'text/xml')
  ctx.body = $.xml()
  ctx.status = 200
  ctx.set('cache-control', production ? `public, max-age=${TEN_MINUTES_S}`: 'no-cache')
}