import { flatten } from 'ramda'

const STORE_SITEMAP_BUILD_FILE = '/dist/vtex.store-sitemap/build.json'

export async function appsRoutes(ctx: Context, next: () => Promise<void>) {
  const {
    clients: { apps },
    vtex: { logger },
  } = ctx

  try {
    const deps = await apps.getAppsMetaInfos()
    const routesByApp = await Promise.all(
      deps.map(async dep => {
        const build = await apps.getAppJSON<{ entries: string[] }>(
          dep.id,
          STORE_SITEMAP_BUILD_FILE,
          true
        )
        return build?.entries || []
      })
    )
    const routes = flatten(routesByApp)

    ctx.state.useLongCacheControl = true

    ctx.body = {
      routes,
      count: routes?.length ?? 0,
    }
    ctx.status = 200
  } catch (err) {
    logger.error({
      error: err,
      message: 'Failed to get apps routes',
    })
    ctx.body = {
      success: false,
      error: err.message,
    }
    ctx.status = 500
  }

  await next()
}
