import './globals'

import {
  ClientsConfig,
  LRUCache,
  method,
  ParamsContext,
  Service,
} from '@vtex/api'

import { Clients } from './clients'
import { cache } from './middlewares/cache'
import { getCanonical, saveCanonical } from './middlewares/canonical'
import { customSitemap } from './middlewares/customSitemap'
import { generateSitemap } from './middlewares/generateSitemap'
import { methodNotAllowed } from './middlewares/methods'
import { sitemap as newSitemap } from './middlewares/newSitemap'
import { robots } from './middlewares/robots'
import { sitemap } from './middlewares/sitemap'
import { prepareState } from './middlewares/state'
import { userSitemap } from './middlewares/userSitemap'

process.env.DETERMINISTIC_VARY = 'true'

const ONE_SECOND_MS = 1 * 1000
const THREE_SECONDS_MS = 3 * 1000
const FIFTY_SECONDS_MS = 50 * 1000

const sitemapXML = method({
  DEFAULT: methodNotAllowed,
  GET: [cache, sitemap],
})

const catalogCacheStorage = new LRUCache<string, any>({
  max: 30000,
})

const clients: ClientsConfig<Clients> = {
  implementation: Clients,
  options: {
    apps: {
      retries: 2,
      timeout: ONE_SECOND_MS,
    },
    canonicals: {
      retries: 2,
      timeout: ONE_SECOND_MS,
    },
    catalog: {
      memoryCache: catalogCacheStorage,
      retries: 1,
      timeout: THREE_SECONDS_MS,
    },
    default: {
      timeout: FIFTY_SECONDS_MS,
    },
    logger: {
      timeout: THREE_SECONDS_MS,
    },
    routes: {
      timeout: THREE_SECONDS_MS,
    },
    sitemapGC: {
      timeout: FIFTY_SECONDS_MS,
    },
    sitemapPortal: {
      timeout: FIFTY_SECONDS_MS,
    },
  },
}

export default new Service<Clients, State, ParamsContext>({
  clients,
  events: {
    generateSitemap,
  },
  routes: {
    brands: sitemapXML,
    canonical: method({
      DEFAULT: methodNotAllowed,
      GET: [cache, prepareState, getCanonical],
      PUT: saveCanonical,
    }),
    categories: sitemapXML,
    category: sitemapXML,
    custom: method({
      DEFAULT: methodNotAllowed,
      GET: [cache, customSitemap],
    }),
    departments: sitemapXML,
    generateSitemap,
    newSitemap,
    products: sitemapXML,
    robots: method({
      DEFAULT: methodNotAllowed,
      GET: [cache, robots],
    }),
    sitemap: sitemapXML,
    sitemapXML,
    user: method({
      DEFAULT: methodNotAllowed,
      GET: [cache, userSitemap],
    }),
  },
})
