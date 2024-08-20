import { CONFIG_BUCKET, GENERATION_CONFIG_FILE } from '../../utils'

export async function prepare(ctx: EventContext, next: () => Promise<void>) {
  const {
    body,
    vtex: { logger },
    clients: { vbase },
  } = ctx
  const { generationId } = body

  if (!generationId) {
    logger.error({ message: 'Missing generation id', payload: body })
    return
  }

  const generationConfig = (await vbase.getJSON<GenerationConfig>(
    CONFIG_BUCKET,
    GENERATION_CONFIG_FILE,
    true
  )) || { generationId: null }

  const { generationId: currentGenerationId } = generationConfig

  if (generationId !== currentGenerationId) {
    logger.debug({
      message: 'Invalid generation id',
      payload: body,
      generationConfig,
    })
    return
  }
  await next()
}
