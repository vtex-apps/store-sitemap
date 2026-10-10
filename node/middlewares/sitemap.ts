import * as cheerio from 'cheerio'

import { MultipleSitemapGenerationError } from '../errors'
import {
  CMS_ROUTES_PREFIX,
  EXTENDED_INDEX_FILE,
  xmlTruncateNodes,
  getBucket,
  hashString,
  SitemapNotFound,
  startSitemapGeneration,
} from '../utils'
import {
  CMS_ROUTES_INDEX,
  currentDate,
  SitemapIndex,
} from './generateMiddlewares/utils'

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
  host: string,
  lastUpdated: string,
  bindingAddress?: string
) => {
  const querystring = bindingAddress
    ? `?__bindingAddress=${bindingAddress}`
    : ''
  return `<sitemap>
      <loc>https://${host}/sitemap.xml${querystring}</loc>
      <lastmod>${lastUpdated}</lastmod>
    </sitemap>`
}

const sitemapIndex = async (ctx: Context) => {
  const {
    state: {
      enabledIndexFiles,
      forwardedHost,
      binding,
      bucket,
      rootPath,
      bindingAddress,
      settings,
    },
    clients: { vbase },
  } = ctx

  const $ = cheerio.load(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    {
      xmlMode: true,
    }
  )

  // CMS routes are stored in a dedicated bucket (Decision 1 of the spec) and
  // only read when the rollout flag is on (invariant 9 — settings gating). The
  // read is fire-and-forget on absence: missing CMS index simply means there
  // are no extra sub-sitemaps to append.
  const cmsRoutesPromise = settings?.enableCmsRoutes
    ? vbase.getJSON<SitemapIndex>(
        getBucket(CMS_ROUTES_PREFIX, hashString(binding.id)),
        CMS_ROUTES_INDEX,
        true
      )
    : Promise.resolve(null as SitemapIndex | null)

  const rawIndexFiles = await Promise.all([
    ...enabledIndexFiles.map(indexFile =>
      vbase.getJSON<SitemapIndex>(bucket, indexFile, true)
    ),
    vbase.getJSON<SitemapIndex>(
      getBucket('', hashString(binding.id)),
      EXTENDED_INDEX_FILE,
      true
    ),
    cmsRoutesPromise,
  ])

  const indexFiles = rawIndexFiles.filter(Boolean) as SitemapIndex[]

  if (indexFiles.length === 0) {
    throw new SitemapNotFound('Sitemap not found')
  }

  const index = [
    ...new Set(
      indexFiles.reduce(
        (acc, { index: fileIndex }) => acc.concat(fileIndex),
        [] as string[]
      )
    ),
  ]

  const lastUpdated = indexFiles[0].lastUpdated

  const indexXML = index.map(entry =>
    sitemapIndexEntry(
      forwardedHost,
      rootPath,
      entry,
      lastUpdated,
      bindingAddress
    )
  )
  $('sitemapindex').append(xmlTruncateNodes(indexXML))
  return $
}

const sitemapBindingIndex = async (ctx: Context) => {
  const {
    state: { forwardedHost, matchingBindings: bindings },
    vtex: { production },
  } = ctx

  const $ = cheerio.load(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    {
      xmlMode: true,
    }
  )

  const date = currentDate()
  const bindingsIndexXML = bindings.map(binding =>
    sitemapBindingEntry(
      production ? binding.canonicalBaseAddress : forwardedHost,
      date,
      production ? '' : binding.canonicalBaseAddress
    )
  )
  $('sitemapindex').append(xmlTruncateNodes(bindingsIndexXML))
  return $
}

export async function sitemap(ctx: Context, next: () => Promise<void>) {
  const {
    state: { isCrossBorder },
  } = ctx

  if (isCrossBorder) {
    await legacySitemap(ctx)
  } else {
    await catalogSitemap(ctx)
  }

  next()
}

async function legacySitemap(ctx: Context) {
  const {
    state: {
      isCrossBorder,
      matchingBindings,
      bindingAddress,
      rootPath,
      settings,
    },
    vtex: { logger },
  } = ctx

  logger.info({
    message: 'Fetching legacy sitemap',
    payload: {
      isCrossBorder,
      matchingBindings,
      bindingAddress,
      rootPath,
      ignoreBindings: settings.ignoreBindings,
    },
  })

  const hasBindingIdentifier = rootPath || bindingAddress
  let $: any
  try {
    if (hasBindingIdentifier || settings.ignoreBindings) {
      $ = await sitemapIndex(ctx)
    } else {
      const hasMultipleMatchingBindings = matchingBindings.length > 1
      $ = hasMultipleMatchingBindings
        ? await sitemapBindingIndex(ctx)
        : await sitemapIndex(ctx)
    }
  } catch (err) {
    if (err instanceof SitemapNotFound) {
      ctx.status = 404
      ctx.body = 'Generating sitemap...'
      ctx.vtex.logger.error(err.message)
      await startSitemapGeneration(ctx).catch(err => {
        if (!(err instanceof MultipleSitemapGenerationError)) {
          throw err
        }
      })
    }
    throw err
  }

  ctx.body = $.xml()
}

async function catalogSitemap(ctx: Context) {
  const {
    clients: { catalog },
    headers: { 'x-forwarded-host': forwardedHost },
    state: { isCrossBorder, forwardedPath },
    vtex: { logger },
  } = ctx

  logger.info({
    message: 'Fetching catalog sitemap',
    payload: {
      forwardedHost,
      forwardedPath,
      isCrossBorder,
    },
  })

  const sitemapData = await catalog.getSitemap(forwardedHost, forwardedPath)
  ctx.body = sitemapData
}
