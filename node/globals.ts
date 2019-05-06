import { ServiceContext } from '@vtex/api'

import { Clients } from './clients'

declare global {
  type Context = ServiceContext<Clients>
  type Maybe<T> = T | null | undefined
  type Middleware = (ctx: Context) => Promise<void>
}
