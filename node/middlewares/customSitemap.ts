import { Apps } from '@vtex/api'
import * as cheerio from 'cheerio'
import { forEach, keys, map, not, path, reject } from 'ramda'

import { currentDate, notFound } from '../resources/utils'
import { Context, Maybe, Middleware } from '../utils/helpers'

const SITEMAP_FILE_PATH = 'dist/vtex.store-sitemap/sitemap.json'

const cheerioOptions = {
  decodeEntities: false,
  xmlMode: true,
}

const toString = ({data}: {data: Buffer}) => data.toString()

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

const getAppFile = (apps: Apps) => (app: string): Promise<Maybe<Sitemap>> => apps.getAppFile(app, SITEMAP_FILE_PATH)
  .then(toString)
  .then(JSON.parse)
  .catch(notFound(null))

const TEN_MINUTES_S = 10 * 60

export const customSitemap: Middleware = async (ctx: Context) => {
  const {dataSources: {apps}, vtex: {production}} = ctx
  const $ = cheerio.load('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', cheerioOptions)
  const deps = await apps.getDependencies().then(keys)
  const sitemaps = await Promise.map(deps, getAppFile(apps)).then(reject(not)) as Maybe<Sitemap[]> || []

  const urls = map<Sitemap, Maybe<URL[]>>(path(['urlset', 'url']), sitemaps)
  forEach((ulrs: Maybe<URL[]>) => Array.isArray(urls) && addToSitemap($, ulrs!), urls)

  ctx.set('Content-Type', 'text/xml')
  ctx.set('cache-control', production ? `public, max-age=${TEN_MINUTES_S}`: 'no-cache')
  ctx.body = $.xml()
  ctx.status = 200
}
