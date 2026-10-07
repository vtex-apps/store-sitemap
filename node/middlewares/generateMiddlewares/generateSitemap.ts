import {
  GENERATE_APPS_ROUTES_EVENT,
  GENERATE_PRODUCT_ROUTES_EVENT,
  GENERATE_REWRITER_ROUTES_EVENT,
} from './utils'

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

const DEFAULT_REWRITER_ROUTES_PAYLOAD = {
  count: 0,
  next: null,
  report: {},
}

export async function generateSitemap(ctx: EventContext) {
  const { clients: { events }, body: { generationId }, state: { settings } }  = ctx
  const disableRoutesTerm = settings.disableRoutesTerm
  if (settings.enableNavigationRoutes) {
    events.sendEvent('', GENERATE_REWRITER_ROUTES_EVENT, {
      ...DEFAULT_REWRITER_ROUTES_PAYLOAD,
      disableRoutesTerm,
      generationId,
    } as RewriterRoutesGenerationEvent)
  }

  if (settings.enableProductRoutes) {
    events.sendEvent('', GENERATE_PRODUCT_ROUTES_EVENT, {
      generationId,
      invalidProducts: 0,
      page: 1,
      processedProducts: 0,
    } as ProductRoutesGenerationEvent)
  }

  if (settings.enableAppsRoutes) {
    events.sendEvent('', GENERATE_APPS_ROUTES_EVENT, { generationId })
  }
}
