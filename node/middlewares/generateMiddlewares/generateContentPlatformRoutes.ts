import { Binding } from '@vtex/api'

import {
  ContentEntry,
  EntriesList,
  PublishedEntry,
} from '../../clients/cmsDataPlane'
import {
  DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
  DEFAULT_CONTENT_PLATFORM_STORE_ID,
} from '../settings'
import {
  readCachedEntry,
  writeCachedEntry,
} from '../../services/contentPlatformCache'
import { isEligibleCmsPath } from '../../services/cmsEligibility'
import { resolveActiveCmsSource } from '../../services/cmsSources'
import {
  CMS_ROUTES_MAX_BYTES_PER_FILE,
  CMS_ROUTES_MAX_URLS_PER_FILE,
  CONTENT_PLATFORM_ROUTES_PREFIX,
  TENANT_CACHE_TTL_S,
} from '../../utils'
import {
  CONTENT_PLATFORM_ROUTES_INDEX,
  saveRoutesChunks,
} from './utils'

/**
 * Defaults applied to every Content Platform URL (FR-5).
 */
export const CONTENT_PLATFORM_DEFAULT_CHANGEFREQ: ChangeFreq = 'weekly'
export const CONTENT_PLATFORM_DEFAULT_PRIORITY = 0.5

interface BindingCandidate {
  bindingId: string
  path: string
}

interface RouteCandidate {
  /** Stable identifier of the entry across locales — used to group alternates. */
  entryId: string
  candidate: BindingCandidate
  /** Listing-level `updatedAt` — the source of truth for `<lastmod>`. */
  updatedAt: string
}

interface BuildRouteArgs {
  entryId: string
  candidate: BindingCandidate
  alternates: AlternateRoute[]
  updatedAt: string
}

const toRoute = ({
  entryId,
  candidate,
  alternates,
  updatedAt,
}: BuildRouteArgs): Route => ({
  alternates,
  changefreq: CONTENT_PLATFORM_DEFAULT_CHANGEFREQ,
  id: `${entryId}:${candidate.bindingId}`,
  lastmod: updatedAt,
  path: candidate.path,
  priority: CONTENT_PLATFORM_DEFAULT_PRIORITY,
  source: 'content-platform',
})

const saveBindingChunks = (
  ctx: Context | EventContext,
  bindingId: string,
  routes: Route[]
) =>
  saveRoutesChunks(
    ctx,
    bindingId,
    routes,
    CONTENT_PLATFORM_ROUTES_PREFIX,
    CONTENT_PLATFORM_ROUTES_PREFIX,
    CONTENT_PLATFORM_ROUTES_INDEX,
    CMS_ROUTES_MAX_URLS_PER_FILE,
    CMS_ROUTES_MAX_BYTES_PER_FILE
  )

const indexEntriesByBinding = (
  candidates: RouteCandidate[]
): Map<string, Route[]> => {
  const byEntry = new Map<string, RouteCandidate[]>()
  for (const item of candidates) {
    const group = byEntry.get(item.entryId) ?? []
    group.push(item)
    byEntry.set(item.entryId, group)
  }

  const byId = new Map<string, Route[]>()
  for (const group of byEntry.values()) {
    const alternates: AlternateRoute[] = group.map(({ candidate }) => ({
      bindingId: candidate.bindingId,
      path: candidate.path,
    }))
    for (const { entryId, candidate, updatedAt } of group) {
      const route = toRoute({ alternates, candidate, entryId, updatedAt })
      const bucket = byId.get(candidate.bindingId) ?? []
      bucket.push(route)
      byId.set(candidate.bindingId, bucket)
    }
  }
  return byId
}

interface HydrateEntryArgs {
  accountName: string
  storeId: string
  contentType: string
  entryId: string
  locale?: string
}

/**
 * Hydrate a listing entry into a fully-resolved `PublishedEntry` (with root-
 * level `seo.slug` and `seo.canonical`) by calling `getEntry` per item,
 * scoped to a locale. Backed by a VBase ETag cache so steady-state runs
 * collapse to cheap `304 Not Modified` exchanges: only entries the editor
 * actually touched re-serialize through the Data Plane.
 *
 * Returns `null` for hard failures or when the entry is missing for the
 * requested locale (404 is treated as "skip this binding" — spec invariant
 * "no synthesized alternates").
 */
const hydrateEntry = async (
  ctx: Context | EventContext,
  args: HydrateEntryArgs
): Promise<PublishedEntry | null> => {
  const {
    clients: { cmsDataPlane, vbase },
    vtex: { logger },
  } = ctx
  if (!args.locale) {
    return null
  }
  const cacheKey = {
    contentType: args.contentType,
    entryId: args.entryId,
    locale: args.locale,
  }
  const cached = await readCachedEntry(vbase, cacheKey)
  try {
    const response = await cmsDataPlane.getEntry({
      accountName: args.accountName,
      contentType: args.contentType,
      entryId: args.entryId,
      etag: cached?.etag,
      locale: args.locale,
      storeId: args.storeId,
    })
    if (response.notFound) {
      return null
    }
    if (response.notModified && cached) {
      return cached.entry
    }
    if (response.data) {
      if (response.etag) {
        await writeCachedEntry(
          vbase,
          cacheKey,
          response.etag,
          response.data
        )
      }
      return response.data
    }
    return null
  } catch (error) {
    logger.warn({
      contentType: args.contentType,
      entryId: args.entryId,
      error: error?.message ?? String(error),
      locale: args.locale,
      message: 'Content Platform: failed to hydrate entry; skipping',
      type: 'content-platform-entry-hydration-failed',
    })
    return null
  }
}

const isEligible = (
  entry: PublishedEntry,
  disableRoutesTerm: string
): boolean => {
  const slug = entry.seo?.slug
  if (!slug) {
    return false
  }
  return isEligibleCmsPath({
    canonical: entry.seo?.canonical,
    disableRoutesTerm,
    slug,
  })
}

const listAllEntries = async (
  ctx: Context | EventContext,
  accountName: string,
  storeId: string,
  contentType: string
): Promise<ContentEntry[]> => {
  const {
    clients: { cmsDataPlane },
  } = ctx
  const all: ContentEntry[] = []
  let scroll: string | undefined
  // Cursor-based pagination — repeat until the Data Plane returns `null`.
  // Each call is independent for retry/backoff purposes.
  do {
    // eslint-disable-next-line no-await-in-loop
    const response = await cmsDataPlane.listEntries({
      accountName,
      contentType,
      scroll,
      storeId,
    })
    const data = response.data as EntriesList | undefined
    if (!data?.entries) {
      break
    }
    all.push(...data.entries)
    scroll = data.scroll ?? undefined
  } while (scroll)
  return all
}

/**
 * Bindings with no `defaultLocale` cannot be fanned-out — the Data Plane
 * needs an explicit locale per call. The earlier behaviour silently dropped
 * them via the locale-match fallback; we keep that semantics with an
 * explicit filter.
 */
const localeForBinding = (binding: Binding): string | null =>
  binding.defaultLocale?.trim() || null

const ingestContentType = async (
  ctx: Context | EventContext,
  bindings: Binding[],
  accountName: string,
  storeId: string,
  contentType: string,
  disableRoutesTerm: string
): Promise<RouteCandidate[]> => {
  const listing = await listAllEntries(ctx, accountName, storeId, contentType)
  const results: RouteCandidate[] = []
  for (const entry of listing) {
    const hydratedByBinding = await Promise.all(
      bindings.map(async binding => {
        const locale = localeForBinding(binding)
        if (!locale) {
          return null
        }
        const published = await hydrateEntry(ctx, {
          accountName,
          contentType,
          entryId: entry.id,
          locale,
          storeId,
        })
        if (!published || !isEligible(published, disableRoutesTerm)) {
          return null
        }
        const slug = published.seo?.slug
        if (!slug) {
          return null
        }
        return { binding, slug }
      })
    )
    for (const hydrated of hydratedByBinding) {
      if (!hydrated) {
        continue
      }
      results.push({
        candidate: { bindingId: hydrated.binding.id, path: hydrated.slug },
        entryId: entry.id,
        updatedAt: entry.updatedAt,
      })
    }
  }
  return results
}

const fetchStoreBindings = async (
  ctx: Context | EventContext
): Promise<Binding[]> => {
  const {
    clients: { tenant },
  } = ctx
  const tenantInfo = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })
  return (tenantInfo.bindings ?? []).filter(
    b => b.targetProduct === 'vtex-storefront'
  )
}

/**
 * Ingest Content Platform routes for every store binding and persist them to
 * VBase under `content-platform-routes_*`. P2.1 wires this against the real
 * Content Platform Data Plane API (host `vtexcommercestable.com.br`, path
 * `/api/content-platform/data/*`) with a hardcoded allowlist of routable
 * content types (`landingPage`, `home`). P2.2 lifts the allowlist into a
 * setting, persists ETags across runs and fans out per-locale calls per
 * binding.
 *
 * Mutually exclusive with `generateCmsRoutes` (spec Decision 8 / FR-10): the
 * mutex log fires when both flags are on; the hCMS skip itself happens in
 * `generateCmsRoutes`.
 */
export async function generateContentPlatformRoutes(
  ctx: Context | EventContext,
  next?: () => Promise<void>
) {
  const {
    state: { settings },
    vtex: { account, logger },
  } = ctx

  const activeSource = resolveActiveCmsSource(settings)

  if (activeSource !== 'content-platform') {
    logger.info({
      activeSource,
      message:
        'Content Platform routes generation skipped: source is not active',
      type: 'content-platform-routes-generation-skipped',
    })
    if (next) {
      await next()
    }
    return
  }

  const disableRoutesTerm = settings?.disableRoutesTerm || ''
  const startTime = Date.now()
  logger.info({
    message: 'Content Platform routes generation started',
    type: 'content-platform-routes-generation-start',
  })

  try {
    const bindings = await fetchStoreBindings(ctx)
    const accountName = account
    const storeId =
      settings?.contentPlatformStoreId?.trim() ||
      DEFAULT_CONTENT_PLATFORM_STORE_ID
    const contentTypes =
      settings?.contentPlatformContentTypes &&
      settings.contentPlatformContentTypes.length > 0
        ? settings.contentPlatformContentTypes
        : DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES

    const perTypeCounts: Record<string, number> = {}
    const allCandidates: RouteCandidate[] = []
    for (const contentType of contentTypes) {
      // eslint-disable-next-line no-await-in-loop
      const candidates = await ingestContentType(
        ctx,
        bindings,
        accountName,
        storeId,
        contentType,
        disableRoutesTerm
      )
      perTypeCounts[contentType] = candidates.length
      allCandidates.push(...candidates)
    }

    const byBinding = indexEntriesByBinding(allCandidates)
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
      accountName,
      bindings: bindingIds.length,
      durationMs: Date.now() - startTime,
      message: 'Content Platform routes generation complete',
      perTypeCounts,
      storeId,
      totalFiles,
      totalRoutes,
      type: 'content-platform-routes-generation-success',
    })
  } catch (error) {
    logger.error({
      error,
      message: 'Content Platform routes generation failed',
      type: 'content-platform-routes-generation-error',
    })
    throw error
  } finally {
    if (next) {
      await next()
    }
  }
}
