import { Internal, ListInternalsResponse } from 'vtex.rewriter'
import { flatten } from 'ramda'

import {
  SitemapIndex,
} from '../middlewares/generateMiddlewares/utils'
import {
  EXTENDED_INDEX_FILE,
  getBucket,
  hashString,
} from '../utils'
import {
  readCmsRoutesFromIndex,
  resolveActiveCmsSource,
} from './cmsSources'
import { fetchEligibleHcmsSlugs } from './hcmsRoutes'

// Re-export CMS source helpers for consumers that import from routes.ts.
export {
  ActiveCmsSource,
  resolveActiveCmsSource,
  resolveCmsBucket,
  readCmsIndex,
} from './cmsSources'

const STORE_SITEMAP_BUILD_FILE = '/dist/vtex.store-sitemap/build.json'

const LIST_LIMIT = 300
const MAX_PAGES = 50

const isValidRoute = (internalRoute: Internal) =>
  !internalRoute.disableSitemapEntry &&
  !internalRoute.type.startsWith('notFound') &&
  internalRoute.type !== 'product'

async function fetchInternalRoutes(ctx: Context, limit: number) {
  const {
    clients: { rewriter },
    vtex: { logger },
  } = ctx

  const internalRoutes = []
  let nextCursor
  let pageCount = 0

  do {
    pageCount++
    // eslint-disable-next-line no-await-in-loop
    const response: ListInternalsResponse = await rewriter.listInternalsWithRetry(
      limit,
      nextCursor
    )
    internalRoutes.push(...(response.routes?.filter(isValidRoute) ?? []))
    nextCursor = response.next

    if (pageCount >= MAX_PAGES && nextCursor) {
      logger.warn({
        message: 'Maximum page limit reached for internal routes',
        type: 'internal-routes-max-pages',
        pageCount,
        totalRoutes: internalRoutes.length,
        hasMorePages: true,
      })
      break
    }
  } while (nextCursor)

  return internalRoutes
}

async function fetchExtendedRoutes(ctx: Context) {
  const {
    state: { binding },
    clients: { vbase },
    vtex: { logger },
  } = ctx

  if (!binding) {
    logger.info({
      message: 'Skipping extended routes fetch - no binding context available',
      type: 'extended-routes-skip',
    })
    return []
  }

  const extendedIndex = await vbase.getJSON<SitemapIndex>(
    getBucket('', hashString(binding.id)),
    EXTENDED_INDEX_FILE,
    true
  )

  const extendedEntries = extendedIndex?.index.map(
    entry => `/sitemap/${entry.replace(/^\//, '')}.xml`
  )

  return extendedEntries || []
}

export async function getUserRoutes(ctx: Context) {
  const [internalRoutes, extendedRoutes] = await Promise.all([
    fetchInternalRoutes(ctx, LIST_LIMIT),
    fetchExtendedRoutes(ctx),
  ])

  const validInternalRoutes = internalRoutes
    .filter(isValidRoute)
    .map(route => route.from)

  return [...validInternalRoutes, ...extendedRoutes]
}

export async function getAppsRoutes(ctx: Context) {
  const {
    clients: { apps },
  } = ctx

  const deps = await apps.getAppsMetaInfos()
  const routes = await Promise.all(
    deps.map(async dep => {
      const build = await apps.getAppJSON<{ entries: string[] }>(
        dep.id,
        STORE_SITEMAP_BUILD_FILE,
        true
      )

      return build?.entries || []
    })
  )

  return flatten<string>(routes)
}

export async function getCmsRoutes(ctx: Context): Promise<string[]> {
  const {
    state: { settings },
  } = ctx

  if (resolveActiveCmsSource(settings) !== 'hcms') {
    return []
  }

  return fetchEligibleHcmsSlugs(ctx)
}

export async function getContentPlatformRoutes(ctx: Context): Promise<string[]> {
  const {
    state: { binding, settings },
    clients: { vbase },
  } = ctx

  const activeSource = resolveActiveCmsSource(settings)
  if (activeSource !== 'content-platform' || !binding?.id) {
    return []
  }

  return readCmsRoutesFromIndex(activeSource, vbase, binding.id)
}
