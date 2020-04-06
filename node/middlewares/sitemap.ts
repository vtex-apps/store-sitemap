import { Binding, VBase } from '@vtex/api'
import * as cheerio from 'cheerio'
import RouteParser from 'route-parser'

import { currentDate, SITEMAP_INDEX_URL, SitemapNotFound } from '../utils'
import { SITEMAP_INDEX, SitemapIndex } from './generateSitemap'

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

export async function sitemap(ctx: Context, next: () => Promise<void>) {
  const {
    state: {
      forwardedHost,
      forwardedPath,
      bucket,
      rootPath,
      hasMultipleMatchingBindings,
      matchingBindings,
    },
    clients: { vbase },
  } = ctx

  const sitemapRoute = new RouteParser(SITEMAP_INDEX_URL)
  const sitemapParams = sitemapRoute.match(forwardedPath)
  if (!sitemapParams) {
    ctx.status = 404
    ctx.body = `Sitemap not found the URL must be: ${SITEMAP_INDEX_URL}`
    throw new Error(`URL differs from the expected, ${forwardedPath}`)
  }
  const { bindingIdentifier } = sitemapParams

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
      $ = hasMultipleMatchingBindings
        ? await sitemapBindingIndex(forwardedHost, rootPath, matchingBindings)
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

  ctx.body = $.xml()
  next()
}
