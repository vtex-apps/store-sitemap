import {
  AppClient,
  GraphQLClient,
  InstanceOptions,
  IOContext,
} from '@vtex/api'

export class GraphQLServer extends AppClient {
  protected graphql: GraphQLClient

  constructor(ctx: IOContext, opts?: InstanceOptions) {
    super('vtex.graphql-server@1.x', ctx, opts)
    this.graphql = new GraphQLClient(this.http)
  }

  public query = async (query: string, variables: any, extensions: any) => {
    return this.graphql.query(
      {
        extensions,
        query,
        variables,
      },
      {
        params: {
          locale: this.context.locale,
        },
        url: '/graphql',
      }
    )
  }
}
