import { Logger, VBase } from '@vtex/api'

import {
  CMS_ROUTES_INDEX,
  CONTENT_PLATFORM_ROUTES_INDEX,
  GENERATE_CMS_ROUTES_EVENT,
  GENERATE_CONTENT_PLATFORM_ROUTES_EVENT,
  SitemapEntry,
  SitemapIndex,
} from '../middlewares/generateMiddlewares/utils'
import { Settings } from '../middlewares/settings'
import {
  CMS_ROUTES_PREFIX,
  CONTENT_PLATFORM_ROUTES_PREFIX,
  getBucket,
  hashString,
} from '../utils'

export type ActiveCmsSource = 'hcms' | 'content-platform' | 'none'

export interface CmsSourceDefinition {
  id: Exclude<ActiveCmsSource, 'none'>
  bucketPrefix: string
  indexFile: string
  generateEvent: string
  customRoutesSectionName: string
}

export const CMS_SOURCES: Record<
  Exclude<ActiveCmsSource, 'none'>,
  CmsSourceDefinition
> = {
  hcms: {
    bucketPrefix: CMS_ROUTES_PREFIX,
    customRoutesSectionName: 'cms-routes',
    generateEvent: GENERATE_CMS_ROUTES_EVENT,
    id: 'hcms',
    indexFile: CMS_ROUTES_INDEX,
  },
  'content-platform': {
    bucketPrefix: CONTENT_PLATFORM_ROUTES_PREFIX,
    customRoutesSectionName: 'content-platform-routes',
    generateEvent: GENERATE_CONTENT_PLATFORM_ROUTES_EVENT,
    id: 'content-platform',
    indexFile: CONTENT_PLATFORM_ROUTES_INDEX,
  },
}

/**
 * Resolve which CMS source produces emitted XML / JSON for this generation
 * (invariant 10 — single active CMS source / spec Decision 8).
 */
export const resolveActiveCmsSource = (
  settings: Partial<Settings> | undefined
): ActiveCmsSource => {
  if (settings?.enableContentPlatformRoutes) {
    return 'content-platform'
  }
  if (settings?.enableCmsRoutes) {
    return 'hcms'
  }
  return 'none'
}

export const isCmsMutualExclusivityConflict = (
  settings: Partial<Settings> | undefined
): boolean =>
  Boolean(settings?.enableCmsRoutes && settings?.enableContentPlatformRoutes)

export const logCmsMutualExclusivityIfNeeded = (
  settings: Partial<Settings> | undefined,
  logger: Logger
): void => {
  if (!isCmsMutualExclusivityConflict(settings)) {
    return
  }
  logger.info({
    message:
      'Both enableCmsRoutes and enableContentPlatformRoutes are on; Content Platform wins per Decision 8',
    type: 'cms-routes-ignored-by-mutual-exclusivity',
  })
}

export const getCmsSourceDefinition = (
  activeSource: Exclude<ActiveCmsSource, 'none'>
): CmsSourceDefinition => CMS_SOURCES[activeSource]

/** VBase bucket for the active CMS source, or `null` when none is enabled. */
export const resolveCmsBucket = (
  activeCmsSource: ActiveCmsSource,
  bindingId: string
): string | null => {
  if (activeCmsSource === 'none') {
    return null
  }
  const { bucketPrefix } = getCmsSourceDefinition(activeCmsSource)
  return getBucket(bucketPrefix, hashString(bindingId))
}

export const readCmsIndex = (
  activeCmsSource: ActiveCmsSource,
  vbase: VBase,
  bindingId: string
): Promise<SitemapIndex | null> => {
  if (activeCmsSource === 'none') {
    return Promise.resolve(null)
  }
  const { bucketPrefix, indexFile } = getCmsSourceDefinition(activeCmsSource)
  return vbase.getJSON<SitemapIndex>(
    getBucket(bucketPrefix, hashString(bindingId)),
    indexFile,
    true
  )
}

export const readCmsRoutesFromIndex = async (
  activeCmsSource: ActiveCmsSource,
  vbase: VBase,
  bindingId: string
): Promise<string[]> => {
  const index = await readCmsIndex(activeCmsSource, vbase, bindingId)
  if (!index?.index?.length) {
    return []
  }
  const bucket = resolveCmsBucket(activeCmsSource, bindingId)
  if (!bucket) {
    return []
  }
  const entries = await Promise.all(
    index.index.map(file => vbase.getJSON<SitemapEntry>(bucket, file, true))
  )
  return entries.reduce<string[]>((acc, entry) => {
    if (!entry?.routes) {
      return acc
    }
    for (const route of entry.routes) {
      acc.push(route.path)
    }
    return acc
  }, [])
}

export const getCmsGenerateEvent = (
  activeCmsSource: ActiveCmsSource
): string | null => {
  if (activeCmsSource === 'none') {
    return null
  }
  return getCmsSourceDefinition(activeCmsSource).generateEvent
}

export const shouldIncludeCustomRoutesSection = (
  sectionName: string,
  activeCmsSource: ActiveCmsSource
): boolean => {
  if (sectionName === 'cms-routes') {
    return activeCmsSource === 'hcms'
  }
  if (sectionName === 'content-platform-routes') {
    return activeCmsSource === 'content-platform'
  }
  return true
}
