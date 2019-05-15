import { AppClient, InstanceOptions, IOContext } from '@vtex/api'

import { SiteMap } from './base'

export class SitemapGC extends AppClient implements SiteMap {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(`gocommerce.sitemap-app`, context, options)
  }

  public fromLegacy = (forwardedPath: string) => this.http.get(forwardedPath)

  public replacePath = (str: string, _: string) => str

  public replaceHost = (str: string, forwardedHost: string) => {
    const { account, workspace } = this.context
    const regex = new RegExp(`${workspace}--${account}.mygocommerce.com`, 'g')
    return str.replace(regex, forwardedHost)
  }
}
