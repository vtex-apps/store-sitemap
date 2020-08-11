import { sleep } from './utils'

export async function sendNextEvent(ctx: EventContext) {
  const { clients: { events }, state: { nextEvent } } = ctx
  const { payload, event } = nextEvent
  // const timeToSleep = Math.ceil(Math.random() * 500)
  await sleep(500)
  events.sendEvent('', event, payload)
}

