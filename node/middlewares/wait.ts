import { sleep } from './generateMiddlewares/utils'

export const WAIT_EVENT = 'sitemap.wait'

export async function wait(ctx: EventContext) {
  const { body, clients: { events } } = ctx
  await sleep(50)

  const { event, payload } = body
  events.sendEvent('', event, payload)
}
