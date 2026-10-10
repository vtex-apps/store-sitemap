import { Internal, ListInternalsResponse } from 'vtex.rewriter'
import { flatten } from 'ramda'

import { isValidCmsRoute } from '../middlewares/generateMiddlewares/generateCmsRoutes'
import { SitemapIndex } from '../middlewares/generateMiddlewares/utils'
import { EXTENDED_INDEX_FILE, getBucket, hashString } from '../utils'

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

  // Extended routes require a binding context
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

  const userRoutes = [...validInternalRoutes, ...extendedRoutes]

  return userRoutes
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

/**
 * Return the flat list of CMS-origin route paths that pass the CMS sitemap
 * filter. Mirrors `getUserRoutes` shape (paths across all bindings) so it can
 * be embedded directly in the `customRoutes` JSON cache.
 *
 * Filter logic is shared with `generateCmsRoutes` (the XML pipeline) via
 * `isValidCmsRoute`, keeping both views consistent (invariant 6 — determinism).
 */
export async function getCmsRoutes(ctx: Context): Promise<string[]> {
  const {
    state: { settings },
  } = ctx

  // When the rollout flag is off this feature behaves as if it did not exist
  // (invariant 9 — settings gating); skip the Rewriter calls entirely.
  if (!settings?.enableCmsRoutes) {
    return []
  }

  const disableRoutesTerm = settings.disableRoutesTerm || ''
  const internalRoutes = await fetchInternalRoutes(ctx, LIST_LIMIT)
  return internalRoutes
    .filter(internal => isValidCmsRoute(internal, disableRoutesTerm))
    .map(internal => internal.from)
}
