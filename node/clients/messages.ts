import { MessagesGraphQL } from '@vtex/api'
import { Query, TranslateArgs } from 'vtex.messages'

interface Response {
  translate: Query['translate']
}

interface Variables {
  args: TranslateArgs
}

export class Messages extends MessagesGraphQL {
  public async translateNoCache(args: TranslateArgs) {
    const response = await this.graphql.query<Response, Variables>(
      {
        query: `query Translate($args: TranslateArgs!) {
          translate(args: $args)
        }`,
        variables: { args },
      },
      {
        headers: {
          'cache-control': 'no-cache',
        },
        metric: 'messages-translate-v2',
      }
    )
    return response.data!.translate as string[]
  }
}
