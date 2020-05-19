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
    binding: Binding | null
    bucket: string
    forwardedHost: string
    forwardedPath: string
    rootPath: string
    matchingBindings: Binding[]
    bindingAddress?: string
    nextEvent:  {
      event: string,
      payload: RewriterRoutesGenerationEvent | ProductRoutesGenerationEvent
    }
  }

  type Context = ServiceContext<Clients, State>

  type EventContext = ColossusEventContext<Clients, State>

  type Maybe<T> = T | null | undefined

  type Middleware = (ctx: Context) => Promise<void>

  interface CatalogPageTypeResponse {
    pageType: string
  }

  interface Route {
    path: string,
    imagePath?: string
    imageTitle?: string
  }

  interface Config {
    productionPrefix: string
    generationPrefix: string
  }

  interface RewriterRoutesGenerationEvent {
    next: Maybe<string>
    report: Record<string, number>
    count: number
  }

  interface ProductRoutesGenerationEvent {
    authToken: string
    from: number
    processedProducts: number
    invalidProducts: number
  }
}
