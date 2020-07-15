import { sleep } from './utils'

export async function sendNextEvent(ctx: EventContext) {
  const { clients: { events }, state: { nextEvent } } = ctx
  const { payload, event } = nextEvent
  await sleep(100)
  events.sendEvent('', event, payload)
}

