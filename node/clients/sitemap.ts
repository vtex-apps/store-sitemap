import { ExternalClient, IOContext, InstanceOptions } from '@vtex/api'
import { Functions } from '@gocommerce/utils'

export class SiteMap extends ExternalClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    const { account, workspace } = context
    const baseURL = Functions.isGoCommerceAcc(account)
    ? `https://${workspace}--${account}.mygocommerce.com`
    : 'http://portal.vtexcommercestable.com.br'

    super(
      baseURL,
      context,
      {
        ...options,
        params: {
          an: account,
        },
      }
    )
  }

  public fromLegacy (forwardedPath: string) {
    return this.http.get(forwardedPath)
  }
}