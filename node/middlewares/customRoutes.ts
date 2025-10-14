import { Logger, VBase } from '@vtex/api'

import { MultipleCustomRoutesGenerationError } from '../errors'
import { generateCustomRoutes } from './generateMiddlewares/generateCustomRoutes'
import {
  CONFIG_BUCKET,
  CUSTOM_ROUTES_BUCKET,
  CUSTOM_ROUTES_FILENAME,
  CUSTOM_ROUTES_GENERATION_LOCK_FILENAME,
  validDate,
} from '../utils'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const TWENTY_THREE_HOURS_MS = 23 * 60 * 60 * 1000

const twentyThreeHoursFromNowMS = () =>
  `${new Date(Date.now() + TWENTY_THREE_HOURS_MS)}`

const metricsConfig = {
  customRoutes: {
    failed: 'customRoutes-failed',
    success: 'customRoutes-success',
    cached: 'customRoutes-cached',
    notFound: 'customRoutes-notFound',
    generating: 'customRoutes-generating',
  },
}

const startCustomRoutesGeneration = async (ctx: Context) => {
  const {
    clients: { vbase },
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

  // Execute generation in background - don't await
  generateCustomRoutes(ctx).catch(error => {
    logger.error({
      message: 'Background custom routes generation failed',
      type: 'custom-routes-background-error',
      generationId,
      error,
    })
  })

  logger.info({
    message: 'Custom routes generation started in background',
    type: 'custom-routes-background-started',
    generationId,
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

async function triggerCustomRoutesGeneration(ctx: Context) {
  const {
    vtex: { logger },
  } = ctx

  try {
    await startCustomRoutesGeneration(ctx)
    logger.info({
      message: 'Custom routes generation event triggered',
      type: 'custom-routes-trigger',
    })
  } catch (error) {
    if (error instanceof MultipleCustomRoutesGenerationError) {
      logger.info({
        message: 'Custom routes generation already in progress',
        type: 'custom-routes-already-generating',
      })
      throw error
    }
    logger.error({
      message: 'Failed to trigger custom routes generation',
      error,
      type: 'custom-routes-trigger-error',
    })
    throw error
  }
}

export async function customRoutes(ctx: Context, next: () => Promise<void>) {
  const startTime = process.hrtime()

  const {
    vtex: { logger },
    clients: { vbase },
  } = ctx

  try {
    // Get pre-compiled custom routes from VBase
    const cachedData = await vbase.getJSON<CustomRoutesData>(
      CUSTOM_ROUTES_BUCKET,
      CUSTOM_ROUTES_FILENAME,
      true
    )

    if (!cachedData) {
      // No cached data exists - trigger generation and return 404
      logger.info({
        message: 'No cached custom routes found, triggering generation',
        type: 'custom-routes-not-found',
        fileName: CUSTOM_ROUTES_FILENAME,
      })

      try {
        await triggerCustomRoutesGeneration(ctx)

        ctx.status = 404
        ctx.body = {
          message:
            'Custom routes not available. Generation has been triggered.',
        }

        const diffTime = process.hrtime(startTime)
        metrics.batch(metricsConfig.customRoutes.notFound, diffTime)
        logger.info({
          type: metricsConfig.customRoutes.notFound,
        })
      } catch (error) {
        if (error instanceof MultipleCustomRoutesGenerationError) {
          // Generation already in progress - return 404
          ctx.status = 404
          ctx.body = {
            message: error.message,
          }

          const diffTime = process.hrtime(startTime)
          metrics.batch(metricsConfig.customRoutes.generating, diffTime)
          logger.info({
            type: metricsConfig.customRoutes.generating,
          })
        } else {
          throw error
        }
      }

      await next()
      return
    }

    // Check if data is older than 1 day
    const dataAge = Date.now() - cachedData.timestamp
    const isOld = dataAge >= ONE_DAY_MS

    if (isOld) {
      // Data exists but is old - trigger regeneration in background
      logger.info({
        message: 'Cached custom routes are old, triggering regeneration',
        type: 'custom-routes-stale',
        ageInHours: Math.floor(dataAge / (60 * 60 * 1000)),
      })

      // Fire and forget - don't await
      triggerCustomRoutesGeneration(ctx)
    }

    // Return cached data
    ctx.status = 200
    ctx.body = cachedData.data
    ctx.state.useLongCacheControl = true

    const diffTime = process.hrtime(startTime)
    metrics.batch(metricsConfig.customRoutes.cached, diffTime)
    logger.info({
      message: 'Custom routes served from cache',
      type: metricsConfig.customRoutes.cached,
      ageInHours: Math.floor(dataAge / (60 * 60 * 1000)),
      isStale: isOld,
    })
  } catch (error) {
    ctx.status = 500
    ctx.body = {
      success: false,
      error: 'Failed to retrieve custom routes',
    }

    const diffTime = process.hrtime(startTime)
    metrics.batch(metricsConfig.customRoutes.failed, diffTime)
    logger.error({
      message: 'Error retrieving custom routes',
      error,
      type: metricsConfig.customRoutes.failed,
    })
  }

  await next()
}
