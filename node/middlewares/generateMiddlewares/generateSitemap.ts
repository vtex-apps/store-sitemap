import { GENERATE_PRODUCT_ROUTES_EVENT, GENERATE_SITEMAP_EVENT, GENERATE_USER_ROUTES_EVENT } from './utils'

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

const DEFAULT_USER_ROUTES_PAYLOAD: UserRoutesGenerationEvent = {
  count: 0,
  next: null,
  report: 0,
}

export async function generateSitemap(ctx: EventContext) {
  const { clients: { events }, body: { authToken } } = ctx
  if (!authToken) {
    ctx.vtex.logger.error('Missing authorization token')
    return
  }
  events.sendEvent('', GENERATE_USER_ROUTES_EVENT, DEFAULT_USER_ROUTES_PAYLOAD)
  events.sendEvent('', GENERATE_PRODUCT_ROUTES_EVENT, {
    authToken,
    from: 0,
    invalidProducts: 0,
    processedProducts: 0,
  } as ProductRoutesGenerationEvent)
}
