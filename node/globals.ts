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
    bindingAddress?: string
    nextEvent:  {
      event: string,
      payload: Events
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
    id: string
    path: string,
    alternates: AlternateRoute[]
    imagePath?: string
    imageTitle?: string
  }

  interface AlternateRoute {
    bindingId: string
    path: string
    locale: string
  }

  interface Config {
    productionPrefix: string
    generationPrefix: string
  }

  interface GenerationConfig {
    generationId: string
    authToken: string
    endDate: string
  }

  type Events = RewriterRoutesGenerationEvent | ProductRoutesGenerationEvent | GroupEntriesEvent

  interface DefaultEvent {
    generationId: string
  }

  interface GroupEntriesEvent extends DefaultEvent {
    indexFile: string
  }

  interface RewriterRoutesGenerationEvent extends DefaultEvent  {
    next: Maybe<string>
    report: Record<string, number>
    count: number
  }

  interface ProductRoutesGenerationEvent extends DefaultEvent   {
    from: number
    processedProducts: number
    invalidProducts: number
  }
}
