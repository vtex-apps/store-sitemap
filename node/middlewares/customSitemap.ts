import * as cheerio from 'cheerio'
import {keys, map, not, reject} from 'ramda'

const SITEMAP_FILE_PATH = 'dist/vtex.store-sitemap/sitemap.json'

const cheerioOptions = {
  decodeEntities: false,
  xmlMode: true,
}

const toString = ({data}: {data: Buffer}) => data.toString()

const notFound = <T>(fallback: T) => (error: any): T => {
  if (error.response && error.response.status === 404) {
    return fallback
  }
  throw error
}

const jsonToXml = (url: any): string => {
  const $ = cheerio.load('<url></url>', cheerioOptions)
  $('url').append([
    `<loc>${url.loc}</loc>`,
    `<lastmod>${(new Date()).toISOString().split('T')[0]}</lastmod>`,
    '<changefreq>weekly</changefreq>',
    '<priority>0.4</priority>'
  ])
  return $.xml()
}

const addToSitemap = ($: any, sitemap: any): void => {
  const xmlUrls = map(jsonToXml, sitemap)
  $('urlset').append(xmlUrls)
}

export const customSitemap = async (ctx: Context) => {
  const {apps} = ctx
  const $ = cheerio.load('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', cheerioOptions)
  const deps = keys(await apps.getDependencies())
  const sitemaps = reject(not, await Promise.map(deps, async (dep: string) => await apps.getAppFile(dep, SITEMAP_FILE_PATH)
    .then(toString)
    .then(JSON.parse)
    .catch(notFound(null))
  ))

  const jsonSitemaps = map(({urlset: {url}}) => url, sitemaps)
  map((sitemap) => addToSitemap($, sitemap), jsonSitemaps)

  ctx.set('Content-Type', 'text/xml')
  ctx.body = $.xml()
}
