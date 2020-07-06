import { sleep } from './generateMiddlewares/utils'

export async function wait(ctx: EventContext) {
  const { body, clients: { events } } = ctx
  await sleep(100)

  const { event, payload } = body
  events.sendEvent('', event, payload)
}
