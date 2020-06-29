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
import { generateAppsRoutes } from './middlewares/generateMiddlewares/generateAppsRoutes'
import { generateMasterdataRoutes } from './middlewares/generateMiddlewares/generateMasterdataRoutes'
import { generateProductRoutes } from './middlewares/generateMiddlewares/generateProductRoutes'
import { generateRewriterRoutes } from './middlewares/generateMiddlewares/generateRewriterRoutes'
import {
  generateSitemap,
  generateSitemapFromREST,
} from './middlewares/generateMiddlewares/generateSitemap'
import { groupEntries } from './middlewares/generateMiddlewares/groupEntries'
import { prepare as generationPrepare } from './middlewares/generateMiddlewares/prepare'
import { sendNextEvent } from './middlewares/generateMiddlewares/sendNextEvent'
import { methodNotAllowed } from './middlewares/methods'
import { prepare } from './middlewares/prepare'
import { robots } from './middlewares/robots'
import { settings } from './middlewares/settings'
import { sitemap } from './middlewares/sitemap'
import { sitemapEntry } from './middlewares/sitemapEntry'
import { tenant } from './middlewares/tenant'

const THREE_SECONDS_MS = 3 * 1000
const EIGHT_SECOND_MS = 8 * 1000

const tenantCacheStorage = new LRUCache<string, Cached>({
  max: 3000,
})

const vbaseCacheStorage = new LRUCache<string, Cached>({
  max: 3000,
})

metrics.trackCache('tenant', tenantCacheStorage)
metrics.trackCache('vbase', vbaseCacheStorage)

const clients: ClientsConfig<Clients> = {
  implementation: Clients,
  options: {
    catalog: {
      timeout: EIGHT_SECOND_MS,
    },
    default: {
      concurrency: 5,
      retries: 1,
      timeout: THREE_SECONDS_MS,
    },
    graphqlServer: {
      retries: 1,
      timeout: EIGHT_SECOND_MS,
    },
    messages: {
      timeout: EIGHT_SECOND_MS,
    },
    rewriter: {
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
const sitemapPipeline = [settings,prepare, sitemap]
const sitemapEntryPipeline = [prepare, sitemapEntry]

export default new Service<Clients, State, ParamsContext>({
  clients,
  events: {
    generateAppsRoutes: [settings, generationPrepare, generateAppsRoutes],
    generateMasterdataRoutes: [settings, generationPrepare, generateMasterdataRoutes],
    generateProductRoutes: [generationPrepare, tenant, generateProductRoutes, sendNextEvent],
    generateRewriterRoutes: [generationPrepare, generateRewriterRoutes, sendNextEvent],
    generateSitemap: [settings, generationPrepare, generateSitemap],
    groupEntries: [settings, generationPrepare, groupEntries],
  },
  routes: {
    generateSitemap: generateSitemapFromREST,
    robots: method({
      DEFAULT: methodNotAllowed,
      GET: [cache, binding, robots],
    }),
    sitemap: sitemapPipeline,
    sitemapEntry: sitemapEntryPipeline,
  },
})
