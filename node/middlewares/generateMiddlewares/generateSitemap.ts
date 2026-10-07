/* Generation was replaced by another solution; log callers before removing the route. */
export async function generateSitemapFromREST(ctx: Context) {
  const {
    vtex: { account, workspace, logger },
    query,
    headers,
  } = ctx

  logger.warn({
    account,
    message: 'Deprecated /generate-sitemap route called, generation is no longer needed',
    origin: headers['x-forwarded-for'],
    query,
    type: 'deprecated-generate-sitemap',
    userAgent: headers['user-agent'],
    workspace,
  })

  ctx.status = 200
  ctx.body = 'Sitemap generation through this route is no longer necessary.'
}

/* TODO: remove with the other deprecated generation code once the logs show no callers. */
export async function generateSitemap(ctx: EventContext) {
  const {
    vtex: { account, workspace, logger },
    body,
  } = ctx

  logger.warn({
    account,
    generationId: body?.generationId,
    message: 'Deprecated sitemap.generate event received, generation is no longer needed',
    type: 'deprecated-generate-sitemap',
    workspace,
  })
}
