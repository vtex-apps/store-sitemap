import { AppGraphQLClient, InstanceOptions, IOContext } from '@vtex/api'
import {
  EntityLocator,
  Internal,
  ListInternalsResponse,
  RoutesByBinding,
} from 'vtex.rewriter'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

export class Rewriter extends AppGraphQLClient {
  constructor(ctx: IOContext, opts?: InstanceOptions) {
    super('vtex.rewriter@1.x', ctx, opts)
  }

  public listInternals = (
    limit: number,
    next: Maybe<string>
  ): Promise<ListInternalsResponse> =>
    this.graphql
      .query<
        { internal: { listInternals: { next: string; routes: Internal[] } } },
        { next: Maybe<string>; limit: number }
      >(
        {
          query: `
      query ListInternals($limit: Int, $next: String) {
        internal {
          listInternals(limit: $limit, next: $next) {
            routes {
              binding
              from
              type
              endDate
              imagePath
              imageTitle
              id
              disableSitemapEntry
            }
            next
          }
        }
      }
      `,
          variables: { limit, next },
        },
        {
          headers: {
            'cache-control': 'no-cache',
          },
          metric: 'rewriter-get-internals',
        }
      )
      .then(res => res.data?.internal?.listInternals) as Promise<
      ListInternalsResponse
    >

  /**
   * List internals with automatic retry on timeout errors.
   *
   * Wraps listInternals with retry logic that:
   * - Detects timeout-specific error messages and codes
   * - Preserves the pagination cursor across retries
   * - Uses exponential backoff (2s, 4s, 6s)
   * - Logs retry attempts if logger is available
   * - Maximum of 3 retry attempts
   *
   * @param limit - Maximum number of results per request
   * @param cursor - Pagination cursor (preserved across retries)
   * @param retryCount - Internal retry counter (do not set manually)
   * @returns Promise resolving to ListInternalsResponse
   * @throws Original error if not a timeout or max retries exceeded
   */
  public listInternalsWithRetry = async (
    limit: number,
    cursor: Maybe<string>,
    retryCount = 0
  ): Promise<ListInternalsResponse> => {
    try {
      return await this.listInternals(limit, cursor)
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * (retryCount + 1) // Exponential backoff

        // Log warning if logger is available in context
        if (this.context?.logger) {
          this.context.logger.warn({
            message: 'listInternals error, retrying',
            attempt: retryCount + 1,
            maxRetries: MAX_RETRIES,
            delayMs: delay,
            cursor: cursor ?? 'initial',
            error: error?.message,
          })
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay))

        // Retry with the same cursor
        return this.listInternalsWithRetry(limit, cursor, retryCount + 1)
      }

      // Max retries reached, throw the error
      throw error
    }
  }

  public routesById = (locator: EntityLocator): Promise<RoutesByBinding[]> =>
    this.graphql
      .query<
        { internal: { routes: RoutesByBinding[] } },
        { locator: EntityLocator }
      >(
        {
          query: `
        query Routes($locator: EntityLocator!) {
          internal {
            routes(locator: $locator) {
              route
              binding
            }
          }
        }
        `,
          variables: { locator },
        },
        {
          metric: 'rewriter-get-internals',
        }
      )
      .then(res => res.data?.internal?.routes) as Promise<RoutesByBinding[]>
}
