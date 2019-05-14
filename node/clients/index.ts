import { IOClients } from '@vtex/api'

import { Canonicals } from './canonicals'
import { Robots } from './robots'
import { Routes } from './routes'
import { SiteMap, SiteMapGC } from './sitemap'

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

  public get sitemapGC() {
    return this.getOrSet('sitemapGC', SiteMapGC)
  }
}
