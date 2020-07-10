
import { Binding, LINKED, TenantClient } from '@vtex/api'
import { any, startsWith } from 'ramda'
import { GENERATE_SITEMAP_EVENT } from './middlewares/generateMiddlewares/utils'

export const CONFIG_BUCKET = `${LINKED ? 'linked' : ''}configuration`
export const CONFIG_FILE = 'config.json'
export const GENERATION_CONFIG_FILE = 'generation.json'

export const TENANT_CACHE_TTL_S = 60 * 10

export const STORE_PRODUCT = 'vtex-storefront'

const oneDayFromNowMS = () => `${new Date(Date.now() + 24 * 60 * 60 * 1000)}`

const validBinding = (path: string) => (binding: Binding) => {
  const isStoreBinding = binding.targetProduct === STORE_PRODUCT
  const matchesPath = any(startsWith(path), [
    binding.canonicalBaseAddress,
    ...binding.alternateBaseAddresses,
  ])

  return matchesPath && isStoreBinding
}

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

export const startSitemapGeneration = async (ctx: Context) => {
  const { clients: { vbase, events }, vtex: { logger } } = ctx
  const force = ctx.query.__force !== undefined
  const config = await vbase.getJSON<GenerationConfig>(CONFIG_BUCKET, GENERATION_CONFIG_FILE, true)
  if (config && validDate(config.endDate) && !force) {
    ctx.status = 202
    ctx.body = 'Sitemap generation already in place'
    return
  }
  const generationId = (Math.random() * 10000).toString()
  logger.info({ message: 'New generation starting', generationId })
  await vbase.saveJSON<GenerationConfig>(CONFIG_BUCKET, GENERATION_CONFIG_FILE, {
    endDate: oneDayFromNowMS(),
    generationId,
  })
  events.sendEvent('', GENERATE_SITEMAP_EVENT, { generationId })
}

export const validDate = (endDate: string) => {
  const date = new Date(endDate)
  if (date && date.toString() !== 'Invalid Date' && date <= new Date()) {
    return false
  }
  return true
}
