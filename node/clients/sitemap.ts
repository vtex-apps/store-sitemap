import { ExternalClient, IOContext, InstanceOptions } from '@vtex/api'
import { Functions } from '@gocommerce/utils'

import { baseURL } from '../resources/utils'

export class SiteMap extends ExternalClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    const { account, workspace } = context

    super(
      baseURL(account, workspace),
      context,
      {
        ...options,
        ...(!Functions.isGoCommerceAcc(account) ? { params: { an: account } } : {}),
      }
    )
  }

  public fromLegacy (forwardedPath: string) {
    return this.http.get(forwardedPath)
  }
}