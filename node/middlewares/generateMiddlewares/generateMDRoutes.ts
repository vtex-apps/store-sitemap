import { flatten, splitEvery } from 'ramda'

import { CONFIG_BUCKET, CONFIG_FILE, getBucket, hashString, TENANT_CACHE_TTL_S } from '../../utils'
import { Clients } from './../../clients/index'
import { FILE_LIMIT } from './groupEntries'
import {
  completeRoutes,
  createFileName,
  currentDate,
  GENERATE_REWRITER_ROUTES_EVENT,
  initializeSitemap,
  NAVIGATION_ROUTES_INDEX,
  SitemapEntry,
  SitemapIndex
} from './utils'

const SITEMAP_DOCUMENT_INPUT = {
  dataEntity: 'sitemap',
  fields: ['routes'],
  id: 'sitemap-navigationRoutes',
}

interface MDRoute extends Route {
  type: string
}

const createRoutesByEntity = (routes: MDRoute[], report: Record<string, number>) => routes.reduce(
  (acc, route) => {
    report[route.type] = (report[route.type] || 0) + 1
    acc[route.type].push(route)
    return acc
  },
  {} as Record<string, MDRoute[]>
)
const saveRoutes = (routesByEntity: Record<string, MDRoute[]>, clients: Clients) => async (bindingId: string) => {
  const { vbase } = clients
  const { generationPrefix } = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG

  const bucket = getBucket(generationPrefix, hashString(bindingId))
  const newEntries = await Promise.all(
    Object.keys(routesByEntity).map(async entityType => {
      const entityRoutes = routesByEntity[entityType]
      const splittedRoutes = splitEvery(FILE_LIMIT, entityRoutes)
      return await Promise.all(splittedRoutes.map(async (routes, idx) => {
        const entry = createFileName(entityType, idx)
        const lastUpdated = currentDate()
        await vbase.saveJSON<SitemapEntry>(bucket, entry, {
          lastUpdated,
          routes,
        })
        return entry
      }))
    })
  )
  const entries: string[] = flatten(newEntries) as any
  const { index } = await vbase.getJSON<SitemapIndex>(bucket, NAVIGATION_ROUTES_INDEX, true)
  await vbase.saveJSON<SitemapIndex>(bucket, NAVIGATION_ROUTES_INDEX, {
    index: [...index, ...entries],
    lastUpdated: currentDate(),
  })
}

export async function generatedMasterDataRoutes(ctx: EventContext) {
  await initializeSitemap(ctx, NAVIGATION_ROUTES_INDEX)
  const { clients: { masterdata, tenant, vbase } } = ctx

  // TODO: Handle correctly bindingless accounts
  const { bindings } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })

  const routes: MDRoute[] = await masterdata.getDocument(SITEMAP_DOCUMENT_INPUT)
  const report = {}

  const routesByEntity = createRoutesByEntity(routes, report)

  await Promise.all(
    bindings.map(({ id }) => saveRoutes(routesByEntity, ctx.clients)(id))
  )

  await completeRoutes(NAVIGATION_ROUTES_INDEX, vbase)
  ctx.vtex.logger.info({
    message: 'Master data routes complete',
    report,
    type: GENERATE_REWRITER_ROUTES_EVENT,
  })
}


