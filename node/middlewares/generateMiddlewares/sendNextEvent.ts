import { sleep } from './utils'

export async function sendNextEvent(ctx: EventContext) {
  const { clients: { events }, vtex: { logger }, state: { nextEvent } } = ctx
  const { payload, event } = nextEvent
  await sleep(300)
  events.sendEvent('', event, payload)
  logger.debug({ message: 'Event sent', type: event, payload, })
}

