const RETRY_COUNT = 3

export const retry = async (requestFn, retries = 0) => {
  try {
    return await requestFn()
  } catch (error) {
    if (retries < RETRY_COUNT) {
      console.error(
        `Request to ${error.config && error.config.url} failed with message: ${error.message}. ` +
        `Retrying: ${retries + 1}/${RETRY_COUNT} times...`,
      )
      return await retry(requestFn, retries + 1)
    } else {
      throw error
    }
  }
}
