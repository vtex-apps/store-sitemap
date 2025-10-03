import { TooManyRequestsError } from '@vtex/api'
import { any } from 'ramda'

const ERROR_429 = 'E_HTTP_429'

const isTooManyRequestError = (error: any) => {
  // Checks if has one error and it is the TooManyRequestError
  if (error.graphQLErrors && error.graphQLErrors.length === 1) {
    return any((err: any )=> err.extensions?.exception?.code === ERROR_429 , error.graphQLErrors)
  }
  return false
}

export async function errors(_: EventContext, next: () => Promise<void>) {
  try {
    await next()
  } catch (error) {
    if (isTooManyRequestError(error)) {
      throw new TooManyRequestsError()
    }
    throw error
  }
}
