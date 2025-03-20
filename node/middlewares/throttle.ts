import { TooManyRequestsError } from '@vtex/api'

import { sleep } from './generateMiddlewares/utils'

const MAX_REQUEST = 4
let COUNTER = 0

export async function throttle(_: EventContext, next: () => Promise<void>) {
  COUNTER++
  try {
    if (COUNTER > MAX_REQUEST) {
      const timeToSleep = Math.ceil(Math.random() * 100)
      await sleep(timeToSleep)
      throw new TooManyRequestsError()
    }
    await next()
  } finally {
    COUNTER--
  }
}
