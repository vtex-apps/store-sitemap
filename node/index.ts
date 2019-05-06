import './globals'

import { ClientsConfig, method, Service } from '@vtex/api'

import { Clients } from './clients'
import { getCanonical, saveCanonical } from './middlewares/canonical'
import { customSitemap } from './middlewares/customSitemap'
import { methodNotAllowed } from './middlewares/methods'
import { robots } from './middlewares/robots'
import { sitemap } from './middlewares/sitemap'
import { userSitemap } from './middlewares/userSitemap'

const THREE_SECONDS_MS = 3 * 1000
const ONE_SECOND_MS = 1 * 1000

const clients: ClientsConfig<Clients> = {
  implementation: Clients,
  options: {
    apps: {
      timeout: ONE_SECOND_MS,
    },
    canonicals: {
      timeout: ONE_SECOND_MS,
    },
    logger: {
      timeout: THREE_SECONDS_MS,
    },
    routes: {
      timeout: THREE_SECONDS_MS,
    },
  },
}

export default new Service({
  clients,
  routes: {
    brands: method({
      DEFAULT: methodNotAllowed,
      GET: sitemap,
    }),
    canonical: method({
      DEFAULT: methodNotAllowed,
      GET: getCanonical,
      PUT: saveCanonical,
    }),
    category: method({
      DEFAULT: methodNotAllowed,
      GET: sitemap,
    }),
    custom: method({
      DEFAULT: methodNotAllowed,
      GET: customSitemap,
    }),
    departments: method({
      DEFAULT: methodNotAllowed,
      GET: sitemap,
    }),
    products: method({
      DEFAULT: methodNotAllowed,
      GET: sitemap,
    }),
    robots: method({
      DEFAULT: methodNotAllowed,
      GET: robots,
    }),
    sitemap: method({
      DEFAULT: methodNotAllowed,
      GET: sitemap,
    }),
    user: method({
      DEFAULT: methodNotAllowed,
      GET: userSitemap,
    }),
  },
})
