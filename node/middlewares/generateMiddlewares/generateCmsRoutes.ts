import { Internal, ListInternalsResponse } from 'vtex.rewriter'

import {
  CMS_ROUTES_MAX_BYTES_PER_FILE,
  CMS_ROUTES_MAX_URLS_PER_FILE,
  CMS_ROUTES_PREFIX,
  getBucket,
  hashString,
} from '../../utils'
import {
  CMS_ROUTES_INDEX,
  createFileName,
  currentDate,
  SitemapEntry,
  SitemapIndex,
} from './utils'

const LIST_LIMIT = 300
const MAX_PAGES = 100

// Types managed by other generators / not CMS-origin.
const FRAMEWORK_OWNED_TYPES = new Set([
  'product',
  'department',
  'category',
  'subcategory',
  'brand',
])

// Page classifications that are mandatorily excluded from the sitemap
// per FR-3 (regardless of merchant toggle).
const MANDATORY_EXCLUDED_TYPE_FRAGMENTS = ['login', 'error']

export const isCmsOriginType = (rawType: string | undefined): boolean => {
  const type = (rawType || '').toLowerCase()
  if (!type) {
    return false
  }
  if (type.startsWith('notfound')) {
    return false
  }
  if (FRAMEWORK_OWNED_TYPES.has(type)) {
    return false
  }
  if (MANDATORY_EXCLUDED_TYPE_FRAGMENTS.some(fragment => type.includes(fragment))) {
    return false
  }
  return true
}

export const isValidCmsRoute = (
  internal: Internal,
  disableRoutesTerm: string
): boolean => {
  if (internal.disableSitemapEntry) {
    return false
  }
  if (!isCmsOriginType(internal.type)) {
    return false
  }
  if (disableRoutesTerm && internal.from.includes(disableRoutesTerm)) {
    return false
  }
  return true
}

// Defaults for sitemap protocol tags applied to every CMS route (FR-5).
// They can be overridden once hCMS exposes per-page values (Decision 3).
export const CMS_ROUTES_DEFAULT_CHANGEFREQ: ChangeFreq = 'weekly'
export const CMS_ROUTES_DEFAULT_PRIORITY = 0.5

const toRoute = (internal: Internal, alternates: AlternateRoute[]): Route => ({
  alternates,
  changefreq: CMS_ROUTES_DEFAULT_CHANGEFREQ,
  id: internal.id,
  imagePath: internal.imagePath || undefined,
  imageTitle: internal.imageTitle || undefined,
  path: internal.from,
  priority: CMS_ROUTES_DEFAULT_PRIORITY,
})

// Rough JSON byte size estimate — adequate as a proxy for serialized output
// because XML produced from each Route is within a constant factor of its JSON.
const estimateRouteBytes = (route: Route): number => JSON.stringify(route).length

interface ChunkAccumulator {
  chunks: Route[][]
  current: Route[]
  currentBytes: number
}

const newAccumulator = (): ChunkAccumulator => ({
  chunks: [],
  current: [],
  currentBytes: 0,
})

const pushRoute = (acc: ChunkAccumulator, route: Route) => {
  const routeBytes = estimateRouteBytes(route)
  const wouldExceedUrls = acc.current.length >= CMS_ROUTES_MAX_URLS_PER_FILE
  const wouldExceedBytes =
    acc.current.length > 0 &&
    acc.currentBytes + routeBytes > CMS_ROUTES_MAX_BYTES_PER_FILE
  if (wouldExceedUrls || wouldExceedBytes) {
    acc.chunks.push(acc.current)
    acc.current = []
    acc.currentBytes = 0
  }
  acc.current.push(route)
  acc.currentBytes += routeBytes
}

const flushAccumulator = (acc: ChunkAccumulator): Route[][] => {
  if (acc.current.length > 0) {
    acc.chunks.push(acc.current)
    acc.current = []
    acc.currentBytes = 0
  }
  return acc.chunks
}

const partitionByBinding = (
  internals: Internal[],
  disableRoutesTerm: string
): Map<string, Route[]> => {
  const byId = new Map<string, Internal[]>()
  for (const internal of internals) {
    if (!isValidCmsRoute(internal, disableRoutesTerm)) {
      continue
    }
    const group = byId.get(internal.id) ?? []
    group.push(internal)
    byId.set(internal.id, group)
  }

  const byBinding = new Map<string, Route[]>()
  for (const group of byId.values()) {
    const alternates: AlternateRoute[] = group.map(i => ({
      bindingId: i.binding,
      path: i.from,
    }))
    for (const internal of group) {
      const bucket = byBinding.get(internal.binding) ?? []
      bucket.push(toRoute(internal, alternates))
      byBinding.set(internal.binding, bucket)
    }
  }
  return byBinding
}

const fetchAllInternals = async (ctx: Context | EventContext): Promise<Internal[]> => {
  const {
    clients: { rewriter },
    vtex: { logger },
  } = ctx
  const internals: Internal[] = []
  let cursor: Maybe<string> = null
  let page = 0
  do {
    page += 1
    // eslint-disable-next-line no-await-in-loop
    const response: ListInternalsResponse = await rewriter.listInternalsWithRetry(
      LIST_LIMIT,
      cursor
    )
    internals.push(...(response.routes ?? []))
    cursor = response.next
    if (page >= MAX_PAGES && cursor) {
      logger.warn({
        message: 'CMS routes generation: reached MAX_PAGES, stopping pagination',
        type: 'cms-routes-max-pages',
        page,
        totalRoutes: internals.length,
      })
      break
    }
  } while (cursor)
  return internals
}

const saveBindingChunks = async (
  ctx: Context | EventContext,
  bindingId: string,
  routes: Route[]
) => {
  const {
    clients: { vbase },
  } = ctx
  const bucket = getBucket(CMS_ROUTES_PREFIX, hashString(bindingId))
  const acc = newAccumulator()
  for (const route of routes) {
    pushRoute(acc, route)
  }
  const chunks = flushAccumulator(acc)
  const lastUpdated = currentDate()
  const fileNames: string[] = []
  // Sequential writes keep order predictable across runs (determinism per invariant 6).
  for (let i = 0; i < chunks.length; i += 1) {
    const fileName = createFileName('cms-routes', i)
    // eslint-disable-next-line no-await-in-loop
    await vbase.saveJSON<SitemapEntry>(bucket, fileName, {
      lastUpdated,
      routes: chunks[i],
    })
    fileNames.push(fileName)
  }
  await vbase.saveJSON<SitemapIndex>(bucket, CMS_ROUTES_INDEX, {
    index: fileNames,
    lastUpdated,
  })
  return fileNames.length
}

export async function generateCmsRoutes(
  ctx: Context | EventContext,
  next?: () => Promise<void>
) {
  const {
    state: { settings },
    vtex: { logger },
  } = ctx

  if (!settings?.enableCmsRoutes) {
    logger.info({
      message: 'CMS routes generation skipped: enableCmsRoutes is off',
      type: 'cms-routes-generation-skipped',
    })
    if (next) {
      await next()
    }
    return
  }

  const disableRoutesTerm = settings.disableRoutesTerm || ''
  const startTime = Date.now()
  logger.info({
    message: 'CMS routes generation started',
    type: 'cms-routes-generation-started',
  })

  try {
    const internals = await fetchAllInternals(ctx)
    const byBinding = partitionByBinding(internals, disableRoutesTerm)

    const bindingIds = Array.from(byBinding.keys())
    const fileCounts = await Promise.all(
      bindingIds.map(bindingId =>
        saveBindingChunks(ctx, bindingId, byBinding.get(bindingId)!)
      )
    )

    const totalRoutes = Array.from(byBinding.values()).reduce(
      (sum, routes) => sum + routes.length,
      0
    )
    const totalFiles = fileCounts.reduce((sum, n) => sum + n, 0)

    logger.info({
      message: 'CMS routes generation complete',
      type: 'cms-routes-generation-complete',
      durationMs: Date.now() - startTime,
      bindings: bindingIds.length,
      totalFiles,
      totalRoutes,
    })
  } catch (error) {
    logger.error({
      error,
      message: 'CMS routes generation failed',
      type: 'cms-routes-generation-error',
    })
    throw error
  } finally {
    if (next) {
      await next()
    }
  }
}
