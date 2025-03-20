export async function userRoutes(ctx: Context, next: () => Promise<void>) {
  const {
    clients: { rewriter },
    vtex: { logger },
  } = ctx

  try {
    const LIST_LIMIT = 300
    const internalRoutes = []
    let nextCursor

    do {
      // eslint-disable-next-line no-await-in-loop
      const response = await rewriter.listInternals(LIST_LIMIT, nextCursor)
      internalRoutes.push(...(response.routes || []))
      nextCursor = response.next
    } while (nextCursor)

    const validRoutes = internalRoutes.filter(
      route =>
        !route.disableSitemapEntry &&
        !route.type.startsWith('notFound') &&
        route.type !== 'product'
    )

    const routes = validRoutes.map(route => route.from)

    ctx.body = {
      routes,
      count: validRoutes?.length ?? 0,
    }
    ctx.status = 200
  } catch (err) {
    logger.error({
      error: err,
      message: 'Failed to get user routes',
    })
    ctx.body = {
      success: false,
      error: err.message,
    }
    ctx.status = 500
  }

  await next()
}
