import { AppGraphQLClient, InstanceOptions, IOContext } from '@vtex/api'
import { Internal, ListInternalsResponse } from 'vtex.rewriter'

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
}
