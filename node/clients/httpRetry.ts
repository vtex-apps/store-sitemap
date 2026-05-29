export const DEFAULT_MAX_RETRIES = 3
export const DEFAULT_RETRY_DELAY_MS = 1000

export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })

export const isRetriable5xx = (status: number | undefined): boolean =>
  typeof status === 'number' && status >= 500 && status < 600

export interface RetriableGetOptions<T> {
  metric: string
  maxRetries?: number
  retryDelayMs?: number
  request: () => Promise<T>
  getStatus: (error: unknown) => number | undefined
}

/**
 * Execute a GET with bounded linear backoff on 5xx responses.
 */
export const withRetriableGet = async <T>({
  getStatus,
  maxRetries = DEFAULT_MAX_RETRIES,
  metric,
  request,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}: RetriableGetOptions<T>): Promise<T> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await request()
    } catch (error) {
      const status = getStatus(error)
      if (!isRetriable5xx(status) || attempt >= maxRetries) {
        throw error
      }
      await sleep(retryDelayMs * (attempt + 1))
    }
  }
  throw new Error(`${metric}: exhausted retries without response`)
}
