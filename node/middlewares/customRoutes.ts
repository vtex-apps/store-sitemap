import { getAppsRoutes, getUserRoutes } from '../services/routes'

export async function customRoutes(ctx: Context, next: () => Promise<void>) {
  const start = process.hrtime()

  const {
    vtex: { logger },
  } = ctx

  const fetchRoutes = async (
    fetchFunction: (ctx: Context) => Promise<string[]>,
    metricName: string
  ) =>
    fetchFunction(ctx).catch(err => {
      const diff = process.hrtime(start)
      metrics.batch(metricName, diff)
      logger.error({
        error: err,
        type: metricName,
      })
      return null
    })

  const [appsRoutes, userRoutes] = await Promise.all([
    fetchRoutes(getAppsRoutes, 'customRoutes-getAppsRoutes-failed'),
    fetchRoutes(getUserRoutes, 'customRoutes-getUserRoutes-failed'),
  ])

  if (appsRoutes && userRoutes) {
    ctx.body = [
      { name: 'apps-routes', routes: appsRoutes },
      { name: 'user-routes', routes: userRoutes },
    ]
    ctx.status = 200

    ctx.state.useLongCacheControl = true

    const diff = process.hrtime(start)
    metrics.batch('customRoutes-success', diff)
  } else {
    ctx.body = {
      success: false,
      error: {
        appsRoutes: !appsRoutes ? 'Failed to get apps routes' : null,
        userRoutes: !userRoutes ? 'Failed to get user routes' : null,
      },
    }
    ctx.status = 500
  }

  await next()
}
