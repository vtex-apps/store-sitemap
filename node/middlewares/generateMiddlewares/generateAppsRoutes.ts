import { Apps, VBase } from '@vtex/api'
import { flatten, splitEvery } from 'ramda'

import {
  CONFIG_BUCKET,
  CONFIG_FILE,
  getBucket,
  hashString,
  TENANT_CACHE_TTL_S
} from '../../utils'
import { FILE_LIMIT } from './groupEntries'
import {
  APPS_ROUTES_INDEX,
  completeRoutes,
  createFileName,
  currentDate,
  DEFAULT_CONFIG,
  SitemapEntry,
  SitemapIndex,
} from './utils'

const APP_ROUTES_ENTITY = 'appsRoutes'
const STORE_SITEMAP_BUILD_FILE =`/dist/vtex.store-sitemap/build.json`

interface SitemapBuild {
  entries: string[]
}

const getRoutes = async (apps: Apps): Promise<string[]> => {
  const deps = await apps.getAppsMetaInfos()
  const routes = await Promise.all(
    deps.map(async dep => {
      const build = await apps.getAppJSON<SitemapBuild | null>(dep.id, STORE_SITEMAP_BUILD_FILE, true)
      return build ? build.entries || [] : []
    }
    ))
  return flatten<string>(routes)
}

const saveRoutes = async (routes: string[], idx: number, bucket: string, vbase: VBase) => {
  const sitemapRoutes = routes.map(route => ({ id: route, path: route }))
  const entry = createFileName(APP_ROUTES_ENTITY, idx)
  await vbase.saveJSON<SitemapEntry>(bucket, entry, {
    lastUpdated: currentDate(),
    routes: sitemapRoutes,
  })
  return entry
}

export async function generateAppsRoutes(ctx: EventContext) {
  const { clients: { apps, tenant, vbase }, vtex: { logger } } = ctx

  const { bindings } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })
  const { generationPrefix } = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG

  const appsRoutes = await getRoutes(apps)

  await Promise.all(bindings.map(async binding => {
    const bucket = getBucket(generationPrefix, hashString(binding.id))
    const splittedRoutes = splitEvery(FILE_LIMIT, appsRoutes)
    const index = await Promise.all(splittedRoutes.map((routes, idx) => saveRoutes(routes, idx, bucket, vbase)))
    await vbase.saveJSON<SitemapIndex>(bucket, APPS_ROUTES_INDEX, {
      index,
      lastUpdated: currentDate(),
    })
  }))

  await completeRoutes(APPS_ROUTES_INDEX, vbase)
  logger.info({
    message: 'Apps routes complete',
    numberOfroutes: appsRoutes.length,
    type: 'apps-routes',
  })
}
