import { Binding, VBase } from '@vtex/api'
import * as cheerio from 'cheerio'
import RouteParser from 'route-parser'

import { BindingResolver } from '../resources/bindings'
import {
  currentDate,
  getStoreBindings,
  hashString,
  SITEMAP_INDEX_URL,
  SitemapNotFound,
} from '../utils'
import {
  GENERATE_SITEMAP_EVENT,
  SITEMAP_BUCKET,
  SITEMAP_INDEX,
  SitemapIndex,
} from './generateSitemap'

const ONE_DAY_S = 24 * 60 * 60

const sitemapIndexEntry = (
  forwardedHost: string,
  rootPath: string,
  entry: string,
  lastUpdated: string,
  bindingIdentifier?: string
) => {
  const bindingSegment = bindingIdentifier ? `${bindingIdentifier}/` : ''
  return `<sitemap>
      <loc>https://${forwardedHost}${rootPath}/${bindingSegment}sitemap/${entry}.xml</loc>
      <lastmod>${lastUpdated}</lastmod>
    </sitemap>`
}

const sitemapBindingEntry = (
  forwardedHost: string,
  rootPath: string,
  lastUpdated: string,
  bindingIdentifier: string
) =>
  `<sitemap>
      <loc>https://${forwardedHost}${rootPath}/${bindingIdentifier}sitemap/sitemap.xml</loc>
      <lastmod>${lastUpdated}</lastmod>
    </sitemap>`

const sitemapIndex = async (
  forwardedHost: string,
  rootPath: string,
  vbase: VBase,
  bucket: string,
  bindingIdentifier?: string
) => {
  const $ = cheerio.load(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    {
      xmlMode: true,
    }
  )

  const indexData = await vbase.getJSON<SitemapIndex>(
    bucket,
    SITEMAP_INDEX,
    true
  )

  if (!indexData) {
    throw new SitemapNotFound('Sitemap not found')
  }
  const { index, lastUpdated } = indexData as SitemapIndex
  index.forEach(entry =>
    $('sitemapindex').append(
      sitemapIndexEntry(
        forwardedHost,
        rootPath,
        entry,
        lastUpdated,
        bindingIdentifier
      )
    )
  )
  return $
}

const sitemapBindingIndex = async (
  forwardedHost: string,
  rootPath: string,
  bindings: Binding[]
) => {
  const $ = cheerio.load(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    {
      xmlMode: true,
    }
  )

  const date = currentDate()
  const bindingsIdentifiers: string[] = [] // await Promise.all(bindings.map(getIdentifer)
  bindingsIdentifiers.forEach(bindingIdentifier =>
    $('sitemapindex').append(
      sitemapBindingEntry(forwardedHost, rootPath, date, bindingIdentifier)
    )
  )
  return $
}

export async function sitemap(ctx: Context) {
  const {
    vtex: { production },
    clients: { vbase, events, tenant },
  } = ctx
  const forwardedHost = ctx.get('x-forwarded-host')
  let rootPath = ctx.get('x-vtex-root-path')
  // Defend against malformed root path. It should always start with `/`.
  if (rootPath && !rootPath.startsWith('/')) {
    rootPath = `/${rootPath}`
  }
  const [forwardedPath] = ctx.get('x-forwarded-path').split('?')
  const sitemapRoute = new RouteParser(SITEMAP_INDEX_URL)
  const sitemapParams = sitemapRoute.match(forwardedPath)
  if (!sitemapParams) {
    ctx.status = 404
    ctx.body = `Sitemap not found the URL must be: ${SITEMAP_INDEX_URL}`
    throw new Error(`URL differs from the expected, ${forwardedPath}`)
  }
  const { bindingIdentifier } = sitemapParams

  const storeBindinigs = await getStoreBindings(tenant)
  const hasMultipleStoreBindings = storeBindinigs.length > 1
  const bindingResolver = new BindingResolver()
  const bucket = hasMultipleStoreBindings
    ? `${hashString((await bindingResolver.discoverId(ctx)) as string)}`
    : SITEMAP_BUCKET

  let $: any
  try {
    if (bindingIdentifier) {
      $ = await sitemapIndex(
        forwardedHost,
        rootPath,
        vbase,
        bucket,
        bindingIdentifier
      )
    } else {
      $ = hasMultipleStoreBindings
        ? await sitemapBindingIndex(forwardedHost, rootPath, storeBindinigs)
        : await sitemapIndex(forwardedHost, rootPath, vbase, bucket)
    }
  } catch (err) {
    if (err instanceof SitemapNotFound) {
      ctx.status = 404
      ctx.body = 'Generating sitemap...'
      ctx.vtex.logger.error(err.message)
      return
    }
  }

  ctx.set('Content-Type', 'text/xml')
  ctx.body = $.xml()
  ctx.status = 200
  ctx.set(
    'cache-control',
    production ? `public, max-age=${ONE_DAY_S}` : 'no-cache'
  )
  if (production) {
    events.sendEvent('', GENERATE_SITEMAP_EVENT)
  }
}
