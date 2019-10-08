import { AppGraphQLClient, InstanceOptions, IOContext } from '@vtex/api'
import { path } from 'ramda'

export interface RouteIndexFiles {
  lastChangeDate: string
  routeIndexFiles: RouteIndexFileEntry[]
}

export interface RouteIndexFileEntry {
  fileName: string
  fileSize: number
}

export interface RouteIndexEntry {
  id: string
  lastChangeDate: string
}

export interface Internal {
  from: string
  declarer: string // vtex.store@2.x
  type: string // product
  id: string // 123
  query: JSON | null // {subtype: 'default'}
  bindings: string[] | null // binding where this route is appliable
  endDate: string | null // When the internal route expires
  imagePath: string | null
  imageTitle: string | null
}

export class Rewriter extends AppGraphQLClient {
  public constructor(ctx: IOContext, opts?: InstanceOptions) {
    super('vtex.rewriter', ctx, opts)
  }

  public routesIndexFiles = (): Promise<RouteIndexFiles> =>
    this.graphql
      .query<string[], {}>(
        {
          query: `
      query RoutesIndexFiles {
        internal {
          indexFiles {
            routeIndexFiles {
              fileName
              fileSize
            }
          }
        }
      }
      `,
          variables: {},
        },
        {
          metric: 'rewriter-get-internals-index-files',
        }
      )
      .then(path(['data', 'internal', 'indexFiles']) as any) as Promise<RouteIndexFiles>

  public listInternals = (from: number, to: number, indexFile: string): Promise<Internal[]> =>
    this.graphql
      .query<Internal[], { from: number; to: number, indexFile: string }>(
        {
          query: `
      query ListInternals($from: Int!, $to: Int!, $indexFile: String) {
        internal {
          list(from: $from, to: $to, indexFile: $indexFile) {
            from
            type
            endDate
            imagePath
            imageTitle
          }
        }
      }
      `,
          variables: { from, to, indexFile },
        },
        {
          metric: 'rewriter-get-internals',
        }
      )
      .then(path(['data', 'internal', 'list']) as any) as Promise<Internal[]>
}
