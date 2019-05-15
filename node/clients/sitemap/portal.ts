import { JanusClient } from '@vtex/api'

import { SiteMap } from './base'

export class SitemapPortal extends JanusClient implements SiteMap {
  public fromLegacy = async (forwardedPath: string) => {
    const normalizedPath = forwardedPath.startsWith('/sitemap.xml')
      ? forwardedPath
      : `/sitemap${forwardedPath}`
    return this.http.get<string>(normalizedPath)
  }

  public replacePath = (str: string, newPath: string) => {
    const regex = new RegExp('/sitemap/', 'g')
    return str.replace(regex, newPath)
  }

  public replaceHost = (str: string, newHost: string) => {
    const regex = new RegExp('portal.vtexcommercestable.com.br', 'g')
    return str.replace(regex, newHost)
  }
}
