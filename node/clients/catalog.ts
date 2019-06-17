import { ExternalClient, InstanceOptions, IOContext } from '@vtex/api'

export class Catalog extends ExternalClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(
      `http://${context.account}.vtexcommercestable.com.br/api/catalog_system`,
      context,
      {
        ...options,
      }
    )
  }

  public pageType = (path: string) =>
    this.http.get<CatalogPageTypeResponse>(
      `/pub/portal/pagetype/${path}`,
      { metric: 'portal-pagetype' }
    )
}
