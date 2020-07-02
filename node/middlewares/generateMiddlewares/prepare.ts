import { CONFIG_BUCKET, GENERATION_CONFIG_FILE } from '../../utils'
import { SITEMAP_GENERATION_ENABLED } from './utils'

export async function prepare(ctx: EventContext, next: () => Promise<void>) {
  const { body, vtex: { logger }, clients: { vbase } } = ctx
  const { generationId } = body
  if (!SITEMAP_GENERATION_ENABLED) {
    logger.info('Sitemap generation disbled')
    return
  }
  if (!generationId) {
    logger.error({ message: 'Missing generation id', payload: body })
    return
  }
  const { generationId: currentGenerationId } = await vbase.getJSON<GenerationConfig>(CONFIG_BUCKET, GENERATION_CONFIG_FILE, true)
    || { generationId: null }
  if (generationId !== currentGenerationId) {
    logger.debug({ message: 'Invalid generation id', payload: body })
    return
  }
  await next()
}
