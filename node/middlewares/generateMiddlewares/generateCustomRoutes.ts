import { getAppsRoutes, getUserRoutes } from '../../services/routes'
import {
  clearCustomRoutesGenerationLock,
  CUSTOM_ROUTES_BUCKET,
  CUSTOM_ROUTES_FILENAME,
} from '../../utils'

export async function generateCustomRoutes(ctx: EventContext) {
  const {
    clients: { vbase },
    vtex: { logger, account },
  } = ctx

  const startTime = process.hrtime()

  try {
    logger.info({
      message: 'Starting custom routes generation',
      type: 'custom-routes-generation',
      account,
    })

    // Create a minimal context-like object for the route functions
    const routeCtx = {
      clients: ctx.clients,
      state: ctx.state,
      vtex: ctx.vtex,
    } as Context

    const [appsRoutes, userRoutes] = await Promise.all([
      getAppsRoutes(routeCtx),
      getUserRoutes(routeCtx),
    ])

    const customRoutesData: CustomRoutesData = {
      timestamp: Date.now(),
      data: [
        { name: 'apps-routes', routes: appsRoutes },
        { name: 'user-routes', routes: userRoutes },
      ],
    }

    // Save to VBase using custom-routes bucket
    await vbase.saveJSON<CustomRoutesData>(
      CUSTOM_ROUTES_BUCKET,
      CUSTOM_ROUTES_FILENAME,
      customRoutesData
    )

    logger.info({
      message: 'Custom routes saved',
      account,
      appsRoutesCount: appsRoutes.length,
      userRoutesCount: userRoutes.length,
      fileName: CUSTOM_ROUTES_FILENAME,
    })

    // Clear generation lock after successful completion
    await clearCustomRoutesGenerationLock(vbase, account, logger)

    const timeDiff = process.hrtime(startTime)
    logger.info({
      message: 'Custom routes generation complete',
      type: 'custom-routes-generation-complete',
      account,
      duration: timeDiff,
    })
  } catch (error) {
    console.error('Error generating custom routes:', error)
    // Clear generation lock on error as well
    await clearCustomRoutesGenerationLock(vbase, account, logger)

    const timeDiff = process.hrtime(startTime)
    logger.error({
      message: 'Error generating custom routes',
      error,
      type: 'custom-routes-generation-error',
      account,
      duration: timeDiff,
    })
    throw error
  }
}
