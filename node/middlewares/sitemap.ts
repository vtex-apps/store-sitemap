import { Binding, VBase } from '@vtex/api'
import * as cheerio from 'cheerio'

import { currentDate, SitemapNotFound } from '../utils'
import { GENERATE_SITEMAP_EVENT, PRODUCT_ROUTES_INDEX, REWRITER_ROUTES_INDEX, SitemapIndex } from './generateMiddlewares/utils'

const sitemapIndexEntry = (
  forwardedHost: string,
  rootPath: string,
  entry: string,
  lastUpdated: string,
  bindingAddress?: string
) => {
  const querystring = bindingAddress
    ? `?__bindingAddress=${bindingAddress}`
    : ''
  return `<sitemap>
      <loc>https://${forwardedHost}${rootPath}/sitemap/${entry}.xml${querystring}</loc>
      <lastmod>${lastUpdated}</lastmod>
    </sitemap>`
}

const sitemapBindingEntry = (
  forwardedHost: string,
  rootPath: string,
  lastUpdated: string,
  bindingAddress?: string
) => {
  const querystring = bindingAddress
    ? `?__bindingAddress=${bindingAddress}`
    : ''
  return `<sitemap>
      <loc>https://${forwardedHost}${rootPath}/sitemap.xml${querystring}</loc>
      <lastmod>${lastUpdated}</lastmod>
    </sitemap>`
}

const sitemapIndex = async (
  forwardedHost: string,
  rootPath: string,
  vbase: VBase,
  bucket: string,
  bindingAddress?: string
) => {
  const $ = cheerio.load(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    {
      xmlMode: true,
    }
  )

  const [rewriterIndexData, productsIndexData] = await Promise.all([
      vbase.getJSON<SitemapIndex>(
        bucket,
        REWRITER_ROUTES_INDEX,
        true
      ),
      vbase.getJSON<SitemapIndex>(
        bucket,
        PRODUCT_ROUTES_INDEX,
        true
      ),
  ])
  if (!productsIndexData || !rewriterIndexData) {
    throw new SitemapNotFound('Sitemap not found')
  }
  const indexData = {
    index: productsIndexData.index.concat(rewriterIndexData.index),
    lastUpdated: productsIndexData.lastUpdated,
  }

  const { index, lastUpdated } = indexData
  index.forEach(entry =>
    $('sitemapindex').append(
      sitemapIndexEntry(
        forwardedHost,
        rootPath,
        entry,
        lastUpdated,
        bindingAddress
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
  bindings.forEach(binding => {
    $('sitemapindex').append(
      sitemapBindingEntry(
        forwardedHost,
        rootPath,
        date,
        rootPath ? '' : binding.canonicalBaseAddress
      )
    )
  })
  return $
}

export async function sitemap(ctx: Context, next: () => Promise<void>) {
  const {
    state: {
      forwardedHost,
      bucket,
      rootPath,
      matchingBindings,
      bindingAddress,
    },
    clients: { events, vbase },
    vtex: { adminUserAuthToken },
  } = ctx

  const hasBindingIdentifier = rootPath || bindingAddress
  let $: any
  try {
    if (hasBindingIdentifier) {
      $ = await sitemapIndex(
        forwardedHost,
        rootPath,
        vbase,
        bucket,
        bindingAddress
      )
    } else {
      const hasMultipleMatchingBindings = matchingBindings.length > 1
      $ = hasMultipleMatchingBindings
        ? await sitemapBindingIndex(forwardedHost, rootPath, matchingBindings)
        : await sitemapIndex(forwardedHost, rootPath, vbase, bucket)
    }
  } catch (err) {
    if (err instanceof SitemapNotFound) {
      ctx.status = 404
      ctx.body = 'Generating sitemap...'
      ctx.vtex.logger.error(err.message)
      events.sendEvent('', GENERATE_SITEMAP_EVENT, { authToken: adminUserAuthToken })
      return
    }
    throw err
  }

  ctx.body = $.xml()
  next()
}
