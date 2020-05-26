import { GENERATE_PRODUCT_ROUTES_EVENT, GENERATE_REWRITER_ROUTES_EVENT, GENERATE_SITEMAP_EVENT } from './utils'

export async function generateSitemapFromREST(ctx: Context) {
  const { clients: { events }, vtex: { adminUserAuthToken, logger } }= ctx
  if (!adminUserAuthToken) {
      ctx.status = 401
      logger.error(`Missing adminUserAuth token`)
      return
  }
  events.sendEvent('', GENERATE_SITEMAP_EVENT, { authToken: adminUserAuthToken } )
  ctx.status = 200
}

const DEFAULT_REWRITER_ROUTES_PAYLOAD: RewriterRoutesGenerationEvent = {
  entityCountByBinding: {} as Record<string, Record<string, number>>,
  firstEvent: true,
  next: null,
  report: {},
}

export async function generateSitemap(ctx: EventContext) {
  const { clients: { events }, body: { authToken } } = ctx
  if (!authToken) {
    ctx.vtex.logger.error('Missing authorization token')
    return
  }
  events.sendEvent('', GENERATE_REWRITER_ROUTES_EVENT, DEFAULT_REWRITER_ROUTES_PAYLOAD)
  events.sendEvent('', GENERATE_PRODUCT_ROUTES_EVENT, {
    authToken,
    entityCountByBinding: {} as Record<string, Record<string, number>>,
    from: 0,
    invalidProducts: 0,
    processedProducts: 0,
  } as ProductRoutesGenerationEvent)
}
