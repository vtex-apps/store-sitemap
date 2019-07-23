import { Apps, Logger } from '@vtex/api'
import { map as mapP } from 'bluebird'
import * as cheerio from 'cheerio'
import { forEach, includes, keys, map, not, path, reject, startsWith } from 'ramda'

import { currentDate } from '../resources/utils'

const SITEMAP_FILE_PATH = 'dist/vtex.store-sitemap/sitemap.json'

const cheerioOptions = {
  decodeEntities: false,
  xmlMode: true,
}

const jsonToXml = (url: URL): string => {
  const $ = cheerio.load('<url></url>', cheerioOptions)
  $('url').append(
    `<loc>${url.loc}</loc>`,
    `<lastmod>${currentDate()}</lastmod>`,
    '<changefreq>weekly</changefreq>',
    '<priority>0.4</priority>'
  )
  return $.xml()
}

const addToSitemap = ($: any, urls: URL[]): void =>
  $('urlset').append(map(jsonToXml, urls))

interface URL {
  loc: string
}

interface URLSet {
  url: URL[]
}

interface Sitemap {
  urlset: URLSet
}

const TEN_MINUTES_S = 10 * 60

const getAppSitemap = (apps: Apps, deps: Record<string, string[]>, logger: Logger) => async (appName: string) => {
  const sitemap = await apps.getAppJSON(appName, SITEMAP_FILE_PATH, true)
  if (sitemap && !includes('vtex.store-sitemap@1.x', deps[appName])) {
    logger.warn({message: `App ${appName} exports a sitemap, but does not depend on vtex.store-sitemap@1.x`})
  }
  return sitemap
}

export async function customSitemap (ctx: Context) {
  const {clients: {apps, logger}, vtex: {production}} = ctx
  const $ = cheerio.load('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', cheerioOptions)
  const deps = await apps.getDependencies()
  const depList = reject(startsWith('infra:'), keys(deps))
  const sitemaps = await mapP(depList, getAppSitemap(apps, deps, logger)).then(reject(not)) as Maybe<Sitemap[]> || []

  const urls = map<Sitemap, Maybe<URL[]>>(path(['urlset', 'url']), sitemaps)
  forEach((ulrs: Maybe<URL[]>) => Array.isArray(urls) && addToSitemap($, ulrs!), urls)

  ctx.set('Content-Type', 'text/xml')
  ctx.set('cache-control', production ? `public, max-age=${TEN_MINUTES_S}`: 'no-cache')
  ctx.body = $.xml()
  ctx.status = 200
}
