import { startSitemapGeneration } from '../../utils'
import {
  GENERATE_APPS_ROUTES_EVENT,
  GENERATE_PRODUCT_ROUTES_EVENT,
  GENERATE_REWRITER_ROUTES_EVENT
} from './utils'

export async function generateSitemapFromREST(ctx: Context) {
  ctx.status = 200
  await startSitemapGeneration(ctx)
}

const DEFAULT_REWRITER_ROUTES_PAYLOAD = {
  count: 0,
  next: null,
  report: {},
}

export async function generateSitemap(ctx: EventContext) {
  const { clients: { events }, body: { generationId }, state: { settings } } = ctx
  if (settings.enableNavigationRoutes) {
    events.sendEvent('', GENERATE_REWRITER_ROUTES_EVENT, {
      ...DEFAULT_REWRITER_ROUTES_PAYLOAD,
      generationId,
    } as RewriterRoutesGenerationEvent)
  }

  if (settings.enableProductRoutes) {
    events.sendEvent('', GENERATE_PRODUCT_ROUTES_EVENT, {
      from: 0,
      generationId,
      invalidProducts: 0,
      processedProducts: 0,
    } as ProductRoutesGenerationEvent)
  }
  events.sendEvent('', GENERATE_APPS_ROUTES_EVENT, { generationId })
}
