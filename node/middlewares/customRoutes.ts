import { getAppsRoutes, getUserRoutes } from '../services/routes'

const metricsConfig = {
  appRoutes: {
    failed: 'customRoutes-getAppsRoutes-failed',
    success: 'customRoutes-getAppsRoutes-success',
  },
  userRoutes: {
    failed: 'customRoutes-getUserRoutes-failed',
    success: 'customRoutes-getUserRoutes-success',
  },
  customRoutes: {
    failed: 'customRoutes-failed',
    success: 'customRoutes-success',
  },
}

export async function customRoutes(ctx: Context, next: () => Promise<void>) {
  const startTime = process.hrtime()

  const {
    vtex: { logger },
  } = ctx

  const fetchRoutes = async (
    fetchFunction: (ctx: Context) => Promise<string[]>,
    metricConfig: { failed: string; success: string }
  ) => {
    try {
      const routes = await fetchFunction(ctx)

      const timeDiff = process.hrtime(startTime)
      metrics.batch(metricConfig.success, timeDiff)
      logger.info({ type: metricConfig.success })

      return routes
    } catch (error) {
      const timeDiff = process.hrtime(startTime)
      metrics.batch(metricConfig.failed, timeDiff)
      logger.error({ error, type: metricConfig.failed })

      return null
    }
  }

  const [appsRoutes, userRoutes] = await Promise.all([
    fetchRoutes(getAppsRoutes, metricsConfig.appRoutes),
    fetchRoutes(getUserRoutes, metricsConfig.userRoutes),
  ])

  const hasCustomRoutes = appsRoutes && userRoutes

  if (hasCustomRoutes) {
    ctx.status = 200
    ctx.body = [
      { name: 'apps-routes', routes: appsRoutes },
      { name: 'user-routes', routes: userRoutes },
    ]

    ctx.state.useLongCacheControl = true

    const diffTime = process.hrtime(startTime)
    metrics.batch(metricsConfig.customRoutes.success, diffTime)
    logger.info({ type: metricsConfig.customRoutes.success })
  } else {
    ctx.status = 500
    ctx.body = {
      success: false,
      error: {
        appsRoutes: !appsRoutes ? 'Failed to get apps routes' : null,
        userRoutes: !userRoutes ? 'Failed to get user routes' : null,
      },
    }

    const diffTime = process.hrtime(startTime)
    metrics.batch(metricsConfig.customRoutes.failed, diffTime)
    logger.error({ type: metricsConfig.customRoutes.failed })
  }

  await next()
}
