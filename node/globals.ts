import {
  Binding,
  EventContext as ColossusEventContext,
  RecorderState,
  ServiceContext,
} from '@vtex/api'

import { Clients } from './clients'

declare global {
  interface State extends RecorderState {
    platform?: string
    binding: Binding
    bucket: string
    forwardedHost: string
    forwardedPath: string
    rootPath: string
    matchingBindings: Binding[]
  }

  type Context = ServiceContext<Clients, State>

  type EventContext = ColossusEventContext<Clients, State>

  type Maybe<T> = T | null | undefined

  type Middleware = (ctx: Context) => Promise<void>

  interface CatalogPageTypeResponse {
    pageType: string
  }
}
