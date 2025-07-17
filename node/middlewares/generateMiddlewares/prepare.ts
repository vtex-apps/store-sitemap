import { CONFIG_BUCKET, GENERATION_CONFIG_FILE } from '../../utils'

export async function prepare(ctx: EventContext, next: () => Promise<void>) {
  const {
    body,
    vtex: { logger },
    clients: { vbase },
    state: { isCrossBorder },
  } = ctx

  const { generationId } = body

  if (!isCrossBorder) {
    logger.info({
      message: 'Skipping generation for non-cross-border tenant',
      payload: body,
    })

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
