import { IOClients } from '@vtex/api'

import { Canonicals } from './canonicals'
import { Catalog } from './catalog'
import { Robots } from './robots'
import { Routes } from './routes'
import { SitemapGC } from './sitemap/gocommerce'
import { SitemapPortal } from './sitemap/portal'

export class Clients extends IOClients {
  public get canonicals() {
    return this.getOrSet('canonicals', Canonicals)
  }

  public get catalog() {
    return this.getOrSet('catalog', Catalog)
  }

  public get robots() {
    return this.getOrSet('robots', Robots)
  }

  public get routes() {
    return this.getOrSet('routes', Routes)
  }

  public get sitemapPortal() {
    return this.getOrSet('sitemapPortal', SitemapPortal)
  }

  public get sitemapGC() {
    return this.getOrSet('sitemapGC', SitemapGC)
  }
}
