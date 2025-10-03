import { Binding, LINKED, Logger, TenantClient, VBase } from '@vtex/api'
import { any, startsWith } from 'ramda'

import {
  MultipleCustomRoutesGenerationError,
  MultipleSitemapGenerationError,
} from './errors'
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

export const TENANT_CACHE_TTL_S = 60 * 10

export const STORE_PRODUCT = 'vtex-storefront'

const fiveDaysFromNowMS = () => `${new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)}`
const twentyThreeHoursFromNowMS = () =>
  `${new Date(Date.now() + 23 * 60 * 60 * 1000)}`

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

export const startCustomRoutesGeneration = async (ctx: Context) => {
  const {
    clients: { vbase, events },
    vtex: { logger, account },
  } = ctx

  logger.info({
    message: 'Checking for existing custom routes generation lock',
    type: 'custom-routes-lock-check',
    lockFile: CUSTOM_ROUTES_GENERATION_LOCK_FILENAME,
    bucket: CONFIG_BUCKET,
  })

  const lockFile = await vbase.getJSON<GenerationConfig>(
    CONFIG_BUCKET,
    CUSTOM_ROUTES_GENERATION_LOCK_FILENAME,
    true
  )

  if (lockFile && validDate(lockFile.endDate)) {
    logger.warn({
      message: 'Custom routes generation lock found - generation skipped',
      type: 'custom-routes-lock-found',
      existingGenerationId: lockFile.generationId,
      lockExpiresAt: lockFile.endDate,
      lockFile: CUSTOM_ROUTES_GENERATION_LOCK_FILENAME,
    })
    throw new MultipleCustomRoutesGenerationError(lockFile.endDate, account)
  }

  if (lockFile) {
    logger.info({
      message: 'Lock found but expired - proceeding with generation',
      type: 'custom-routes-lock-expired',
      expiredLock: lockFile,
    })
  } else {
    logger.info({
      message: 'No lock found - proceeding with generation',
      type: 'custom-routes-no-lock',
      lockFile: CUSTOM_ROUTES_GENERATION_LOCK_FILENAME,
    })
  }

  const generationId = (Math.random() * 10000).toString()
  const caller = ctx.request?.header?.['x-vtex-caller'] || 'unknown'
  const endDate = twentyThreeHoursFromNowMS()

  logger.info({
    message: `Custom routes generation started by ${caller}`,
    type: 'custom-routes-generation-started',
    generationId,
    caller,
    lockExpiresAt: endDate,
  })

  try {
    await vbase.saveJSON<GenerationConfig>(
      CONFIG_BUCKET,
      CUSTOM_ROUTES_GENERATION_LOCK_FILENAME,
      {
        endDate,
        generationId,
      }
    )
  } catch (error) {
    throw error
  }

  logger.info({
    message: 'Generation lock file created',
    type: 'custom-routes-lock-created',
    lockFile: CUSTOM_ROUTES_GENERATION_LOCK_FILENAME,
    generationId,
    expiresAt: endDate,
  })

  events.sendEvent('', 'sitemap.generate:custom-routes', { generationId })

  logger.info({
    message: 'Custom routes generation event dispatched',
    type: 'custom-routes-event-dispatched',
    generationId,
    eventKey: 'sitemap.generate:custom-routes',
  })
}

export const clearCustomRoutesGenerationLock = async (
  vbase: VBase,
  logger: Logger
) => {
  logger.info({
    message: 'Attempting to clear custom routes generation lock',
    type: 'custom-routes-lock-clear-attempt',
    lockFile: CUSTOM_ROUTES_GENERATION_LOCK_FILENAME,
    bucket: CONFIG_BUCKET,
  })

  try {
    await vbase.deleteFile(
      CONFIG_BUCKET,
      CUSTOM_ROUTES_GENERATION_LOCK_FILENAME
    )
    logger.info({
      message: 'Custom routes generation lock cleared successfully',
      type: 'custom-routes-lock-cleared',
      lockFile: CUSTOM_ROUTES_GENERATION_LOCK_FILENAME,
    })
  } catch (error) {
    // File might not exist, ignore error but log it
    logger.info({
      message: 'Lock file not found or already cleared',
      type: 'custom-routes-lock-clear-skipped',
      lockFile: CUSTOM_ROUTES_GENERATION_LOCK_FILENAME,
      error: error.message || error,
    })
  }
}
