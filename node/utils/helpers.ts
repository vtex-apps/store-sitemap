import { ServiceContext } from '@vtex/api'

import { DataSources } from '../dataSources'

export type Maybe<T> = T | null | undefined

export type Middleware = (ctx: Context) => Promise<void>

export interface Context extends ServiceContext {
  dataSources: DataSources
}
