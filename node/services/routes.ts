import { ListInternalsResponse } from 'vtex.rewriter'
import { flatten } from 'ramda'

const STORE_SITEMAP_BUILD_FILE = '/dist/vtex.store-sitemap/build.json'

export async function getUserRoutes(ctx: Context) {
  const {
    clients: { rewriter },
  } = ctx

  const LIST_LIMIT = 300
  const internalRoutes = []
  let nextCursor

  do {
    // eslint-disable-next-line no-await-in-loop
    const response: ListInternalsResponse = await rewriter.listInternals(
      LIST_LIMIT,
      nextCursor
    )
    internalRoutes.push(...(response.routes ?? []))
    nextCursor = response.next
  } while (nextCursor)

  const routes = internalRoutes.filter(
    route =>
      !route.disableSitemapEntry &&
      !route.type.startsWith('notFound') &&
      route.type !== 'product'
  )

  return routes.map(route => route.from)
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
