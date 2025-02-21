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
import { Authorization } from './directives/auth'
import { binding } from './middlewares/binding'
import { cache } from './middlewares/cache'
import { errors } from './middlewares/errors'
import { generateAppsRoutes } from './middlewares/generateMiddlewares/generateAppsRoutes'
import { generateProductRoutes } from './middlewares/generateMiddlewares/generateProductRoutes'
import { generateRewriterRoutes } from './middlewares/generateMiddlewares/generateRewriterRoutes'
import {
  generateSitemap,
  generateSitemapFromREST,
} from './middlewares/generateMiddlewares/generateSitemap'
import { groupEntries } from './middlewares/generateMiddlewares/groupEntries'
import { handleCrossBorder } from './middlewares/generateMiddlewares/handleCrossBorder'
import { prepare as generationPrepare } from './middlewares/generateMiddlewares/prepare'
import { sendNextEvent } from './middlewares/generateMiddlewares/sendNextEvent'
import { methodNotAllowed } from './middlewares/methods'
import { prepare } from './middlewares/prepare'
import { robots } from './middlewares/robots'
import { settings } from './middlewares/settings'
import { sitemap } from './middlewares/sitemap'
import { sitemapEntry } from './middlewares/sitemapEntry'
import { tenant } from './middlewares/tenant'
import { throttle } from './middlewares/throttle'
import { resolvers } from './resolvers'

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
    catalogGraphQL: {
      concurrency: 10,
    },
    default: {
      concurrency: 5,
      retries: 1,
      timeout: THREE_SECONDS_MS,
    },
    events: {
      timeout: EIGHT_SECOND_MS,
    },
    graphqlServer: {
      concurrency: 10,
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
      retries: 3,
    },
  },
}
const sitemapPipeline = [settings, handleCrossBorder, prepare, sitemap]
const sitemapEntryPipeline = [prepare, sitemapEntry]

export default new Service<Clients, State, ParamsContext>({
  clients,
  events: {
    generateAppsRoutes: [throttle, errors, generationPrepare, generateAppsRoutes],
    generateProductRoutes: [throttle, errors, generationPrepare, tenant, generateProductRoutes, sendNextEvent],
    generateRewriterRoutes: [throttle, errors, generationPrepare, generateRewriterRoutes, sendNextEvent],
    generateSitemap: [settings, handleCrossBorder, generationPrepare, generateSitemap],
    groupEntries: [throttle, errors, settings, generationPrepare, groupEntries, sendNextEvent],
  },
  graphql: {
    resolvers,
    schemaDirectives: {
      requiresAuth: Authorization,
    },
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
