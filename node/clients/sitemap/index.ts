import { Functions } from '@gocommerce/utils'

import { SiteMap } from './base'

export const sitemapClientFromCtx = ({
  vtex: { account },
  clients,
}: Context): SiteMap =>
  Functions.isGoCommerceAcc(account)
    ? clients.sitemapGC
    : clients.sitemapPortal
