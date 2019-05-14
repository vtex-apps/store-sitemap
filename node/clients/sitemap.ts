import { IOContext, InstanceOptions, AppClient, JanusClient } from '@vtex/api'

export class SiteMap extends JanusClient {
  public fromLegacy = (forwardedPath: string) => this.http.get(forwardedPath)
}

export class SiteMapGC extends AppClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(`gocommerce.sitemap-app`, context, options)
  }

  public fromLegacy (forwardedPath: string) {
    return this.http.get(forwardedPath)
  }
}