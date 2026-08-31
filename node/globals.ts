import {
  Binding,
  EventContext as ColossusEventContext,
  RecorderState,
  ServiceContext,
} from '@vtex/api'
import { Settings } from './middlewares/settings'

import { Clients } from './clients'

declare global {
  interface State extends RecorderState {
    settings: Settings
    enabledIndexFiles: string[]
    platform?: string
    binding: Binding
    bucket: string
    forwardedHost: string
    forwardedPath: string
    rootPath: string
    matchingBindings: Binding[]
    bindingAddress?: string
    isCrossBorder: boolean
    nextEvent:  {
      event: string,
      payload: Events
    }
    useLongCacheControl?: boolean
  }

  type Context = ServiceContext<Clients, State>

  type EventContext = ColossusEventContext<Clients, State>

  type Maybe<T> = T | null | undefined

  type Middleware = (ctx: Context) => Promise<void>

  interface CatalogPageTypeResponse {
    pageType: string
  }

  type ChangeFreq =
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never'

  interface Route {
    id: string
    path: string,
    alternates?: AlternateRoute[]
    imagePath?: string
    imageTitle?: string
    // Optional sitemap protocol tags (sitemaps.org/protocol). When present they
    // are emitted by URLEntry; absent → tag is omitted, preserving backwards
    // compatibility with sources that do not annotate routes.
    changefreq?: ChangeFreq
    priority?: number
    lastmod?: string
    // Origin of the entry, kept for observability / future deduplication. The
    // XML pipeline does not branch on this field — same downstream shape for
    // every source (spec Decision 7).
    source?: 'hcms' | 'content-platform' | 'apps' | 'user'
  }

  interface AlternateRoute {
    bindingId: string
    path: string
  }

  interface Config {
    productionPrefix: string
    generationPrefix: string
  }

  interface GenerationConfig {
    generationId: string
    endDate: string
  }

  type Events = RewriterRoutesGenerationEvent | ProductRoutesGenerationEvent | GroupEntriesEvent

  interface DefaultEvent {
    generationId: string
  }

  interface GroupEntriesEvent extends DefaultEvent {
    indexFile: string
    from: number
  }

  interface RewriterRoutesGenerationEvent extends DefaultEvent  {
    next: Maybe<string>
    report: Record<string, number>
    count: number
    disableRoutesTerm: string
  }

  interface ProductRoutesGenerationEvent extends DefaultEvent   {
    page: number
    processedProducts: number
    invalidProducts: number
  }

  interface CustomRoutesData {
    timestamp: number
    data: Array<{
      name: string
      routes: string[]
    }>
  }
}
