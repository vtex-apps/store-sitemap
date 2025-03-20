import { sleep } from './utils'

export async function sendNextEvent(ctx: EventContext) {
  const {
    clients: { events },
    state: { nextEvent },
  } = ctx
  const { payload, event } = nextEvent
  const timeToSleep = Math.ceil(Math.random() * 100)
  await sleep(timeToSleep)
  events.sendEvent('', event, payload)
}
