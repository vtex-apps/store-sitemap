import { ExternalClient, InstanceOptions, IOContext } from '@vtex/api'

export interface GetProductsAndSkuIdsReponse {
  data: Record<string, number[]>
  range: {
    total: number
    from: number
    to: number
  }
}

export class Catalog extends ExternalClient {
  constructor(protected context: IOContext, options?: InstanceOptions) {
    super(
      `http://${context.account}.vtexcommercestable.com.br`,
      context,
      {
        ...(options ?? {}),
        headers: {
          ...(options?.headers ?? {}),
          'Content-Type': 'application/json',
          'VtexIdclientAutCookie': context.authToken,
          'X-Vtex-Use-Https': 'true',
        },
      }
    )
  }

  public getProductsAndSkuIds (from: number, to: number): Promise<GetProductsAndSkuIdsReponse>{
    return this.http.get('/api/catalog_system/pvt/products/GetProductAndSkuIds', {
      params: {
        _from: from,
        _to: to,
      },
    })
  }
}
