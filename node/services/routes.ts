import { Internal, ListInternalsResponse } from 'vtex.rewriter'
import { flatten } from 'ramda'

import { SitemapIndex } from '../middlewares/generateMiddlewares/utils'
import { Rewriter } from '../clients/rewriter'
import { EXTENDED_INDEX_FILE, getBucket, hashString } from '../utils'

const STORE_SITEMAP_BUILD_FILE = '/dist/vtex.store-sitemap/build.json'

const LIST_LIMIT = 300

const isValidRoute = (internalRoute: Internal) =>
  !internalRoute.disableSitemapEntry &&
  !internalRoute.type.startsWith('notFound') &&
  internalRoute.type !== 'product'

async function fetchInternalRoutes(rewriter: Rewriter, limit: number) {
  const internalRoutes = []
  let nextCursor

  do {
    // eslint-disable-next-line no-await-in-loop
    const response: ListInternalsResponse = await rewriter.listInternals(
      limit,
      nextCursor
    )
    internalRoutes.push(...(response.routes ?? []))
    nextCursor = response.next
  } while (nextCursor)

  return internalRoutes
}

async function fetchExtendedRoutes(ctx: Context) {
  const {
    state: { binding },
    clients: { vbase },
  } = ctx

  const extendedIndex = await vbase.getJSON<SitemapIndex>(
    getBucket('', hashString(binding.id)),
    EXTENDED_INDEX_FILE,
    true
  )

  const extendedEntries = extendedIndex?.index.map(entry =>
    entry.startsWith('/') ? `/sitemap${entry}.xml` : `/sitemap/${entry}.xml`
  )

  return extendedEntries || []
}

export async function getUserRoutes(ctx: Context) {
  const {
    clients: { rewriter },
  } = ctx

  const [internalRoutes, extendedRoutes] = await Promise.all([
    fetchInternalRoutes(rewriter, LIST_LIMIT),
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
