import { VBase } from '@vtex/api'

import { PublishedEntry } from '../clients/cmsDataPlane'

/**
 * VBase bucket holding the Content Platform Data Plane ETag cache. One file
 * per `(contentType, entryId, locale)` triple, populated whenever the Data
 * Plane returns `200 OK` with an ETag. Subsequent runs send the cached ETag
 * via `If-None-Match`; on a `304 Not Modified` the cached payload is reused
 * verbatim, which short-circuits the per-locale fan-out and keeps the
 * sitemap stable even when the Data Plane briefly fails.
 *
 * Each file is small (~6KB for the smoke landing page, dominated by the
 * locale_metadata SVG), and the layout reads at most one file per per-entry
 * per-locale per generation — at FastStore scale the bucket stays well below
 * VBase's per-bucket file ceiling. Stale entries are not eagerly deleted:
 * `listEntries` is the authoritative listing, so a cache row that no longer
 * has a corresponding entry just sits there harmlessly until a future
 * garbage-collection pass (not implemented yet).
 */
export const CONTENT_PLATFORM_CACHE_BUCKET = 'content-platform-data-cache'

export interface CachedEntry {
  etag: string
  entry: PublishedEntry
  cachedAt: string
}

export interface ContentPlatformCacheKey {
  contentType: string
  entryId: string
  locale: string
}

/**
 * Build the VBase file name for a cache key. Each component is base64url
 * encoded so unusual characters in `entryId` (UUIDs are safe, but a custom
 * content type could conceivably include slashes or whitespace) don't
 * collide or break VBase routing. Exposed for tests that seed the cache.
 */
export const cacheFileNameFor = ({
  contentType,
  entryId,
  locale,
}: ContentPlatformCacheKey): string => {
  const safe = (raw: string) =>
    Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  return `${safe(contentType)}__${safe(entryId)}__${safe(locale)}.json`
}

export const readCachedEntry = async (
  vbase: VBase,
  key: ContentPlatformCacheKey
): Promise<CachedEntry | null> =>
  vbase.getJSON<CachedEntry | null>(
    CONTENT_PLATFORM_CACHE_BUCKET,
    cacheFileNameFor(key),
    true
  )

export const writeCachedEntry = async (
  vbase: VBase,
  key: ContentPlatformCacheKey,
  etag: string,
  entry: PublishedEntry
): Promise<void> => {
  await vbase.saveJSON<CachedEntry>(
    CONTENT_PLATFORM_CACHE_BUCKET,
    cacheFileNameFor(key),
    {
      cachedAt: new Date().toISOString(),
      entry,
      etag,
    }
  )
}
