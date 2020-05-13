import { GENERATE_SITEMAP_EVENT, GENERATE_USER_ROUTES_EVENT } from './utils'

export async function generateSitemapFromREST(ctx: Context) {
  const { events } = ctx.clients
  events.sendEvent('', GENERATE_SITEMAP_EVENT)
  ctx.status = 200
}

export async function generateSitemap(ctx: EventContext) {
  const { events } = ctx.clients
  // GENERATE USER ROUTES
  // GENERATE PRODUCTS
  // GENERATE CATEGORIES
  events.sendEvent('', GENERATE_USER_ROUTES_EVENT)
}
