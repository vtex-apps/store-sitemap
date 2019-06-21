import { AppClient, InstanceOptions, IOContext, RequestConfig } from '@vtex/api'

export class Catalog extends AppClient {
  public constructor(ctx: IOContext, opts?: InstanceOptions) {
    super('vtex.catalog-api-proxy', ctx, opts)
  }

  public pageType = (path: string) => this.get<CatalogPageTypeResponse>(
    `/pub/portal/pagetype/${path}`,
    { metric: 'catalog-pagetype' }
  )

  private get = <T = any>(url: string, config: RequestConfig = {}) =>
    this.http.get<T>(`/proxy/catalog${url}`, config)
}
