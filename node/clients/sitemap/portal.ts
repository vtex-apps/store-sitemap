import { JanusClient } from '@vtex/api'

import { SiteMap } from './base'

import { currentDate } from '../../resources/utils'

export class SitemapPortal extends JanusClient implements SiteMap {
  public fromLegacy = async (forwardedPath: string) =>
    this.http.get<string>(forwardedPath)

  public replaceHost = (str: string, newHost: string) => {
    const regex = new RegExp('portal.vtexcommercestable.com.br', 'g')
    return str.replace(regex, newHost)
  }

  public appendSitemapItems = async (currSitemap: any, items: string[]) => {
    const xmlSitemapItem = (loc: string) => `
      <sitemap>
        <loc>${loc}</loc>
        <lastmod>${currentDate()}</lastmod>
      </sitemap>
    `

    for (const item of items) {
      currSitemap.append(xmlSitemapItem(item))
    }
  }
}
