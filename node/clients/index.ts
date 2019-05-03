import { ClientsConfig, IOClients } from '@vtex/api'

import Canonicals from './canonicals'
import Robots from './robots'
import Routes from './routes'
import SiteMap from './sitemap'

const TEN_SECONDS_MS = 10 * 1000
const THREE_SECONDS_MS = 3 * 1000

export class Clients extends IOClients {
  public get canonicals() {
    return this.getOrSet('canonicals', Canonicals)
  }

  public get robots() {
    return this.getOrSet('robots', Robots)
  }

  public get routes() {
    return this.getOrSet('routes', Routes)
  }

  public get sitemap() {
    return this.getOrSet('sitemap', SiteMap)
  }
}

export const clients: ClientsConfig<Clients> = {
  implementation: Clients,
  options: {
    apps: {
      timeout: THREE_SECONDS_MS,
    },
    canonicals: {
      timeout: TEN_SECONDS_MS,
    },
    logger: {
      timeout: THREE_SECONDS_MS,
    },
    routes: {
      timeout: THREE_SECONDS_MS,
    },
  },
}
