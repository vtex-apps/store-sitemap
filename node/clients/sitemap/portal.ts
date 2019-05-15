import { JanusClient } from '@vtex/api'

import { SiteMap } from './base'

export class SitemapPortal extends JanusClient implements SiteMap {
  public fromLegacy = async (forwardedPath: string) =>
    this.http.get<string>(forwardedPath)

  public replaceHost = (str: string, newHost: string) => {
    const regex = new RegExp('portal.vtexcommercestable.com.br', 'g')
    return str.replace(regex, newHost)
  }
}
