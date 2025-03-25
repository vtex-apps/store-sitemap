import { Internal, ListInternalsResponse } from 'vtex.rewriter'
import { flatten } from 'ramda'

import { Rewriter } from '../clients/rewriter'

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

export async function getUserRoutes(ctx: Context) {
  const {
    clients: { rewriter },
  } = ctx

  const internalRoutes = await fetchInternalRoutes(rewriter, LIST_LIMIT)
  const filteredRoutes = internalRoutes.filter(isValidRoute)
  return filteredRoutes.map(route => route.from)
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
