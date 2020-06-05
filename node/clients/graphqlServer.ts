import {
  AppClient,
  GraphQLClient,
  InstanceOptions,
  IOContext,
} from '@vtex/api'
import { any } from 'ramda'


export class ProductNotFound extends Error {
  public graphQLErrors: any

  constructor(graphQLErrors: any[]) {
    super()
    this.graphQLErrors = graphQLErrors
  }
}

const handleNotFoundErrror = (error: any) => {
  if (error.graphQLErrors.length === 1) {
    const hasNotFounError = any((err: any )=> err.message.startsWith('No product was found'), error.graphQLErrors)
    if (hasNotFounError) {
      throw new ProductNotFound(error.graphQLErrors)
    }
  }

  throw error
}

// tslint:disable-next-line:max-classes-per-file
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
    ).catch(err => handleNotFoundErrror(err))
  }
}
