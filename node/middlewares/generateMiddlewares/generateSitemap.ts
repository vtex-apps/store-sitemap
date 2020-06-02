import { startSitemapGeneration } from '../../utils'
import { GENERATE_PRODUCT_ROUTES_EVENT, GENERATE_REWRITER_ROUTES_EVENT } from './utils'

export async function generateSitemapFromREST(ctx: Context) {
  ctx.status = 200
  await startSitemapGeneration(ctx)
}

const DEFAULT_REWRITER_ROUTES_PAYLOAD: RewriterRoutesGenerationEvent = {
  count: 0,
  next: null,
  report: {},
}

export async function generateSitemap(ctx: EventContext) {
  const { clients: { events } } = ctx
  events.sendEvent('', GENERATE_REWRITER_ROUTES_EVENT, DEFAULT_REWRITER_ROUTES_PAYLOAD)
  events.sendEvent('', GENERATE_PRODUCT_ROUTES_EVENT, {
    from: 0,
    invalidProducts: 0,
    processedProducts: 0,
  } as ProductRoutesGenerationEvent)
}
