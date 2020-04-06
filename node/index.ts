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
import { cache } from './middlewares/cache'
import {
  generateSitemap,
  generateSitemapFromREST,
} from './middlewares/generateSitemap'
import { methodNotAllowed } from './middlewares/methods'
import { prepare } from './middlewares/prepare'
import { robots } from './middlewares/robots'
import { sitemap } from './middlewares/sitemap'
import { sitemapEntry } from './middlewares/sitemapEntry'

const THREE_SECONDS_MS = 3 * 1000

const tenantCacheStorage = new LRUCache<string, Cached>({
  max: 3000,
})

const rewriterCacheStorage = new LRUCache<string, Cached>({
  max: 3000,
})

const clients: ClientsConfig<Clients> = {
  implementation: Clients,
  options: {
    rewriter: {
      memoryCache: rewriterCacheStorage,
      timeout: THREE_SECONDS_MS,
    },
    tenant: {
      memoryCache: tenantCacheStorage,
      timeout: THREE_SECONDS_MS,
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
      GET: [cache, robots],
    }),
    sitemap: sitemapPipeline,
    sitemapEntry: sitemapEntryPipeline,
    sitemapEntryWithBinding: sitemapEntryPipeline,
    sitemapWithBinding: sitemapPipeline,
  },
})
