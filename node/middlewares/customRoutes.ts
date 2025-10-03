import { MultipleCustomRoutesGenerationError } from '../errors'
import {
  CUSTOM_ROUTES_BUCKET,
  CUSTOM_ROUTES_FILENAME,
  startCustomRoutesGeneration,
} from '../utils'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

const metricsConfig = {
  customRoutes: {
    failed: 'customRoutes-failed',
    success: 'customRoutes-success',
    cached: 'customRoutes-cached',
    notFound: 'customRoutes-notFound',
    generating: 'customRoutes-generating',
  },
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
