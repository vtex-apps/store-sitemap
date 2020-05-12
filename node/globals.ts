import {
  Binding,
  EventContext as ColossusEventContext,
  RecorderState,
  ServiceContext,
} from '@vtex/api'

import { Clients } from './clients'

declare global {
  interface State extends RecorderState, SitemapGenerationEvent {
    platform?: string
    binding: Binding | null
    bucket: string
    forwardedHost: string
    forwardedPath: string
    rootPath: string
    matchingBindings: Binding[]
    bindingAddress?: string
  }

  type Context = ServiceContext<Clients, State>

  type EventContext = ColossusEventContext<Clients, State>

  type Maybe<T> = T | null | undefined

  type Middleware = (ctx: Context) => Promise<void>

  interface CatalogPageTypeResponse {
    pageType: string
  }

  interface Config {
    productionPrefix: string
    generationPrefix: string
  }

  interface SitemapGenerationEvent {
    next: Maybe<string>
    report: Record<string, number>
    count: number
  }
}
