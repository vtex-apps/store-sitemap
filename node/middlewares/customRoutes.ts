import { getAppsRoutes, getUserRoutes } from '../services/routes'

export async function customRoutes(ctx: Context, next: () => Promise<void>) {
  const {
    vtex: { logger },
  } = ctx

  try {
    const [appsRoutesResult, userRoutesResult] = await Promise.all([
      getAppsRoutes(ctx),
      getUserRoutes(ctx),
    ])

    const combinedRoutes = [
      { name: 'apps-routes', routes: appsRoutesResult.routes },
      { name: 'user-routes', routes: userRoutesResult.routes },
    ]

    ctx.state.useLongCacheControl = true

    ctx.body = combinedRoutes
    ctx.status = 200
  } catch (err) {
    logger.error({
      error: err,
      message: 'Failed to get custom routes',
    })
    ctx.body = {
      success: false,
      error: err.message,
    }
    ctx.status = 500
  }

  await next()
}
