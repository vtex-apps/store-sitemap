import { AppGraphQLClient, InstanceOptions, IOContext } from "@vtex/api";
import { path } from "ramda";
import { Internal, ListInternalsResponse } from "vtex.rewriter";

export class Rewriter extends AppGraphQLClient {
  constructor(ctx: IOContext, opts?: InstanceOptions) {
    super("vtex.rewriter", ctx, opts);
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
          variables: { limit, next }
        },
        {
          metric: "rewriter-get-internals"
        }
      )
      .then(path(["data", "internal", "listInternals"])) as Promise<
      ListInternalsResponse
    >;
}
