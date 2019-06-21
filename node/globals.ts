import { ServiceContext } from '@vtex/api'

import { Clients } from './clients'

declare global {

  interface State {
    platform?: string
  }

  type Context = ServiceContext<Clients, State>

  type Maybe<T> = T | null | undefined

  type Middleware = (ctx: Context) => Promise<void>

  interface CatalogPageTypeResponse {
    pageType: string
  }
}
