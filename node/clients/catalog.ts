import {
  ExternalClient,
  FORWARDED_HOST_HEADER,
  InstanceOptions,
  IOContext,
} from '@vtex/api'

import { CatalogSitemapError } from '../errors/CatalogSitemapError'

export interface GetProductsAndSkuIdsReponse {
  items: number[]
  paging: {
    total: number
    page: number
    perPage: number
    pages: number
  }
}

const PAGE_SIZE = 100

export class Catalog extends ExternalClient {
  constructor(protected context: IOContext, options?: InstanceOptions) {
    super(`http://${context.account}.vtexcommercestable.com.br`, context, {
      ...(options ?? {}),
      headers: {
        ...(options?.headers ?? {}),
        'Content-Type': 'application/json',
        VtexIdclientAutCookie: context.authToken,
        'X-Vtex-Use-Https': 'true',
      },
    })
  }

  public getProductsIds(
    page: number,
    salesChannels?: string[]
  ): Promise<GetProductsAndSkuIdsReponse> {
    return this.http.get('/api/catalog_system/pvt/products/GetProductsIds', {
      params: {
        ...(salesChannels ? { SalesChannelId: salesChannels.join(',') } : {}),
        Active: true,
        Page: page,
        pageSize: PAGE_SIZE,
      },
    })
  }

  public async getSitemap(host: string, path = 'sitemap.xml') {
    try {
      return await this.http.get(path, {
        headers: {
          [FORWARDED_HOST_HEADER]: host,
        },
      })
    } catch (error) {
      throw new CatalogSitemapError(
        `Failed to fetch catalog sitemap: ${error.message}`,
        error
      )
    }
  }
}
