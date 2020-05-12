import './globals'

import {
  Cached,
  ClientsConfig,
  LRUCache,
  method,
  ParamsContext,
  Service,
} from '@vtex/api'

import { Clients } from './clients'
import { binding } from './middlewares/binding'
import { cache } from './middlewares/cache'
import {
  generateSitemap,
  generateSitemapFromREST,
} from './middlewares/generateSitemap'
import { meta } from './middlewares/meta'
import { methodNotAllowed } from './middlewares/methods'
import { prepare } from './middlewares/prepare'
import { robots } from './middlewares/robots'
import { sitemap } from './middlewares/sitemap'
import { sitemapEntry } from './middlewares/sitemapEntry'

const THREE_SECONDS_MS = 3 * 1000
const EIGHT_SECOND_MS = 8 * 1000

const tenantCacheStorage = new LRUCache<string, Cached>({
  max: 3000,
})

const rewriterCacheStorage = new LRUCache<string, Cached>({
  max: 3000,
})

const vbaseCacheStorage = new LRUCache<string, Cached>({
  max: 3000,
})

metrics.trackCache('rewrite', rewriterCacheStorage)
metrics.trackCache('tenant', tenantCacheStorage)
metrics.trackCache('vbase', vbaseCacheStorage)

const clients: ClientsConfig<Clients> = {
  implementation: Clients,
  options: {
    default: {
      retries: 1,
      timeout: THREE_SECONDS_MS,
    },
    rewriter: {
      memoryCache: rewriterCacheStorage,
      timeout: EIGHT_SECOND_MS,
    },
    tenant: {
      memoryCache: tenantCacheStorage,
    },
    vbase: {
      memoryCache: vbaseCacheStorage,
    },
  },
}
const sitemapPipeline = [prepare, sitemap]
const sitemapEntryPipeline = [prepare, sitemapEntry]

export default new Service<Clients, State, ParamsContext>({
  clients,
  events: {
    generateSitemap,
  },
  routes: {
    generateSitemap: generateSitemapFromREST,
    robots: method({
      DEFAULT: methodNotAllowed,
      GET: [cache, binding, robots],
    }),
    sitemap: sitemapPipeline,
    sitemapEntry: sitemapEntryPipeline,
    meta,
  },
})
