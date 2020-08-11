import { Apps } from '@vtex/api'
import { flatten, splitEvery } from 'ramda'

import { CVBase } from '../../clients/Vbase'
import {
  CONFIG_BUCKET,
  CONFIG_FILE,
  getBucket,
  hashString,
  TENANT_CACHE_TTL_S
} from '../../utils'
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
const FILE_LIMIT = 5000

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

const saveRoutes = async (routes: string[], idx: number, bucket: string, cVbase: CVBase) => {
  const sitemapRoutes = routes.map(route => ({ id: route, path: route }))
  const entry = createFileName(APP_ROUTES_ENTITY, idx)
  await cVbase.saveJSON<SitemapEntry>(bucket, entry, {
    lastUpdated: currentDate(),
    routes: sitemapRoutes,
  })
  return entry
}

export async function generateAppsRoutes(ctx: EventContext) {
  const { clients: { apps, tenant, cVbase }, vtex: { logger } } = ctx

  const { bindings } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })
  const { generationPrefix } = await cVbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG

  const appsRoutes = await getRoutes(apps)

  await Promise.all(bindings.map(async binding => {
    const bucket = getBucket(generationPrefix, hashString(binding.id))
    const splittedRoutes = splitEvery(FILE_LIMIT, appsRoutes)
    const index = await Promise.all(splittedRoutes.map((routes, idx) => saveRoutes(routes, idx, bucket, cVbase)))
    await cVbase.saveJSON<SitemapIndex>(bucket, APPS_ROUTES_INDEX, {
      index,
      lastUpdated: currentDate(),
    })
  }))

  await completeRoutes(APPS_ROUTES_INDEX, cVbase)
  logger.info({
    message: 'Apps routes complete',
    numberOfroutes: appsRoutes.length,
    type: 'apps-routes',
  })
}
