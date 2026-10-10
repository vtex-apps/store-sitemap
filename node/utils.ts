import { Binding, LINKED, TenantClient } from '@vtex/api'
import { any, startsWith } from 'ramda'

import { MultipleSitemapGenerationError } from './errors'
import { GENERATE_SITEMAP_EVENT } from './middlewares/generateMiddlewares/utils'

export const CONFIG_BUCKET = `${LINKED ? 'linked' : ''}configuration`
export const CONFIG_FILE = 'config.json'
export const GENERATION_CONFIG_FILE = 'generation.json'
export const CUSTOM_ROUTES_GENERATION_FILE = 'customRoutesGeneration.json'
export const EXTENDED_INDEX_FILE = 'extendedIndex.json'
export const MAX_CALL_STACK_SIZE =  1000

export const CUSTOM_ROUTES_BUCKET = 'custom-routes'
export const CUSTOM_ROUTES_FILENAME = 'custom-routes.json'
export const CUSTOM_ROUTES_GENERATION_LOCK_FILENAME = 'generation-lock.json'

// CMS routes — per Google's sitemap protocol limits (50k URLs / 50 MB per file).
// These ceilings drive the chunking in generateCmsRoutes.
export const CMS_ROUTES_MAX_URLS_PER_FILE = 50000
export const CMS_ROUTES_MAX_BYTES_PER_FILE = 50 * 1024 * 1024
// Legacy hCMS (Headless CMS) routes use the 'hcms-routes' prefix.
export const CMS_ROUTES_PREFIX = 'hcms-routes'

// Content Platform (new VTEX CMS) routes — same Google protocol ceilings, own
// VBase bucket prefix and file-name prefix so that hCMS-legacy and Content
// Platform artifacts coexist (mutually exclusive per generation — spec
// Decision 8).
// VBase enforces a 50-char limit on the full metadata bucket name
// (`vtex.store-sitemap.<bucket>`). The app prefix alone is 19 chars, leaving
// at most 31 chars for the bucket part. `getBucket` appends `_<hash>` (up to
// 12 chars), so the prefix must stay ≤ 19 chars. 'cms-routes' (10 chars) is
// safely within that limit and is used for both external file names and
// internal VBase bucket names.
export const CONTENT_PLATFORM_ROUTES_PREFIX = 'cms-routes'

export const TENANT_CACHE_TTL_S = 60 * 10

export const STORE_PRODUCT = 'vtex-storefront'

const fiveDaysFromNowMS = () => `${new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)}`

const validBinding = (path: string) => (binding: Binding) => {
  const isStoreBinding = binding.targetProduct === STORE_PRODUCT
  const matchesPath = any(startsWith(path), [
    binding.canonicalBaseAddress,
    ...binding.alternateBaseAddresses,
  ])

  return matchesPath && isStoreBinding
}

export const xmlTruncateNodes = ( xml: string[], limit: number = MAX_CALL_STACK_SIZE) =>
  xml.slice(0, limit).join('\n')

export const notFound = <T>(fallback: T) => (error: any): T => {
  if (error.response && error.response.status === 404) {
    return fallback
  }
  throw error
}

export class SitemapNotFound extends Error {}

export const SITEMAP_URL = '/sitemap/:path'

export const getMatchingBindings = async (
  path: string,
  tenant: TenantClient
) => {
  const pathWithoutWorkspace = path.replace(/^(.)+--/, '')
  const tenantInfo = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })
  // gets bindings that matches path
  return tenantInfo.bindings.filter(validBinding(pathWithoutWorkspace))
}

export const hashString = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash += (str.charCodeAt(i) * 31) ** (str.length - i)
    // tslint:disable-next-line:no-bitwise
    hash &= hash
  }
  return hash.toString()
}

export const getBucket = (prefix: string, bucketName: string) => `${prefix}_${bucketName}`

export const startSitemapGeneration = async (ctx: Context, force?: boolean) => {
  const { clients: { vbase, events }, vtex: { logger } } = ctx
  const config = await vbase.getJSON<GenerationConfig>(CONFIG_BUCKET, GENERATION_CONFIG_FILE, true)
  if (config && validDate(config.endDate) && !force) {
    throw new MultipleSitemapGenerationError(config.endDate)
  }
  const generationId = (Math.random() * 10000).toString()
  const caller = ctx.request.header['x-vtex-caller']
  logger.info({ message: `New generation started by ${caller}`, generationId })
  await vbase.saveJSON<GenerationConfig>(CONFIG_BUCKET, GENERATION_CONFIG_FILE, {
    endDate: fiveDaysFromNowMS(),
    generationId,
  })
  events.sendEvent('', GENERATE_SITEMAP_EVENT, { generationId })
}

export const validDate = (endDate: string) => {
  const date = new Date(endDate)
  if ((date && date <= new Date()) || date.toString() === 'Invalid Date') {
    return false
  }
  return true
}

export const getStoreBindings = async (tenant: TenantClient) => {
  const { bindings } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })
  const storeBindings = bindings.filter(binding => binding.targetProduct === STORE_PRODUCT)
  return storeBindings
}
