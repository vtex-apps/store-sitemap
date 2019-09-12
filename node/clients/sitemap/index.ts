import { SiteMap } from './base'

export const sitemapClientFromCtx = ({
  vtex: { platform },
  clients,
}: Context): SiteMap =>
  platform === 'gocommerce'
    ? clients.sitemapGC
    : clients.sitemapPortal
