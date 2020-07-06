import { WAIT_EVENT } from '../wait'
import { sleep } from './utils'

export async function sendNextEvent(ctx: EventContext) {
  const { clients: { events }, state: { nextEvent } } = ctx
  const { payload, event } = nextEvent
  await sleep(100)
  const waitPayload: WaitEvent = {
    event,
    payload,
  }
  events.sendEvent('', WAIT_EVENT, waitPayload)
}

