import { getDefaultStoreBinding } from '../../resources/bindings'
import { clearCustomRoutesGenerationLock } from '../customRoutes'
import {
  getAppsRoutes,
  getCmsRoutes,
  getContentPlatformRoutes,
  getUserRoutes,
} from '../../services/routes'
import { CUSTOM_ROUTES_BUCKET, CUSTOM_ROUTES_FILENAME } from '../../utils'

export async function generateCustomRoutes(ctx: Context) {
  const {
    clients: { vbase, tenant },
    vtex: { logger },
  } = ctx

  const startTime = process.hrtime()

  try {
    logger.info({
      message: 'Starting custom routes generation',
      type: 'custom-routes-generation',
    })

    // Get default store binding for the account
    const defaultBindingId = await getDefaultStoreBinding(ctx)

    // Get tenant info to construct binding object
    const tenantInfo = await tenant.info()
    const binding = tenantInfo.bindings?.find(b => b.id === defaultBindingId)

    // Create a minimal context-like object for the route functions
    // Always include binding in state, even if null (extended routes require it)
    const routeCtx = {
      clients: ctx.clients,
      state: {
        ...ctx.state,
        binding: binding ?? null,
      },
      vtex: ctx.vtex,
    } as Context

    const [appsRoutes, userRoutes, cmsRoutes, contentPlatformRoutes] = await Promise.all([
      getAppsRoutes(routeCtx),
      getUserRoutes(routeCtx),
      getCmsRoutes(routeCtx),
      getContentPlatformRoutes(routeCtx),
    ])

    logger.info({
      message: 'Routes fetched',
      appsRoutesCount: appsRoutes.length,
      cmsRoutesCount: cmsRoutes.length,
      contentPlatformRoutesCount: contentPlatformRoutes.length,
      userRoutesCount: userRoutes.length,
    })

    // Both CMS sources are always written to the cache; the served-time
    // mutex filter in `customRoutes.ts` decides which one is exposed for
    // any given request (spec Decision 8 / FR-10). Each `get*Routes`
    // service already returns `[]` for the inactive source, so the
    // payload reflects the active surface at generation time.
    const customRoutesData: CustomRoutesData = {
      timestamp: Date.now(),
      data: [
        { name: 'apps-routes', routes: appsRoutes },
        { name: 'user-routes', routes: userRoutes },
        { name: 'cms-routes', routes: cmsRoutes },
        { name: 'content-platform-routes', routes: contentPlatformRoutes },
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
      appsRoutesCount: appsRoutes.length,
      userRoutesCount: userRoutes.length,
      fileName: CUSTOM_ROUTES_FILENAME,
    })

    // Clear generation lock after successful completion
    await clearCustomRoutesGenerationLock(vbase, logger)

    const timeDiff = process.hrtime(startTime)
    logger.info({
      message: 'Custom routes generation complete',
      type: 'custom-routes-generation-complete',
      duration: timeDiff,
    })
  } catch (error) {
    // Clear generation lock on error as well
    await clearCustomRoutesGenerationLock(vbase, logger)

    const timeDiff = process.hrtime(startTime)
    logger.error({
      message: 'Error generating custom routes',
      error,
      type: 'custom-routes-generation-error',
      duration: timeDiff,
    })
    throw error
  }
}
