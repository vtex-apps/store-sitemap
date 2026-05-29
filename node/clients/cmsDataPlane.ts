import { ExternalClient, InstanceOptions, IOContext } from '@vtex/api'

import { withRetriableGet } from './httpRetry'

/**
 * Read-only client for the VTEX CMS (Content Platform) Data Plane REST API.
 */

const DATA_PLANE_PATH = '/api/content-platform/data'

export interface EntrySeo {
  slug: string
  title?: string
  description?: string
  canonical?: string
}

export interface ContentEntry {
  id: string
  name: string
  updatedAt: string
  createdAt?: string
  createdBy?: string | null
  searchKeywords?: string[]
}

export interface EntriesList {
  entries: ContentEntry[]
  scroll: string | null
}

export interface PublishedEntry {
  id: string
  slug: string
  seo?: EntrySeo
  sections?: unknown[]
  locale_metadata?: {
    code?: string
    locale?: string
  }
}

export interface DataPlaneListResponse<T> {
  data?: T
  etag?: string
  notModified: boolean
  notFound?: boolean
}

export interface ListEntriesParams {
  accountName: string
  storeId: string
  contentType: string
  locale?: string
  scroll?: string
  etag?: string
}

export interface GetEntryParams {
  accountName: string
  storeId: string
  contentType: string
  entryId: string
  locale?: string
  etag?: string
}

const isNotModified = (status: number | undefined): boolean => status === 304

const isNotFound = (status: number | undefined): boolean => status === 404

export const listEntriesPath = ({
  accountName,
  storeId,
  contentType,
}: Pick<ListEntriesParams, 'accountName' | 'storeId' | 'contentType'>): string =>
  `${DATA_PLANE_PATH}/${accountName}/${storeId}/${contentType}/entries`

export const getEntryPath = ({
  accountName,
  storeId,
  contentType,
  entryId,
}: Pick<
  GetEntryParams,
  'accountName' | 'storeId' | 'contentType' | 'entryId'
>): string =>
  `${DATA_PLANE_PATH}/${accountName}/${storeId}/${contentType}/entries/${entryId}`

export class CmsDataPlane extends ExternalClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(`http://${context.account}.vtexcommercestable.com.br`, context, {
      ...(options ?? {}),
      headers: {
        ...(options?.headers ?? {}),
        Accept: 'application/json',
        VtexIdclientAutCookie: context.authToken,
      },
    })
  }

  public listEntries = (
    params: ListEntriesParams
  ): Promise<DataPlaneListResponse<EntriesList>> =>
    this.getJson<EntriesList>(
      listEntriesPath(params),
      this.buildListParams(params),
      params.etag,
      'cms-data-plane-list-entries'
    )

  public getEntry = (
    params: GetEntryParams
  ): Promise<DataPlaneListResponse<PublishedEntry>> =>
    this.getJson<PublishedEntry>(
      getEntryPath(params),
      this.buildLocaleParams(params.locale),
      params.etag,
      'cms-data-plane-get-entry'
    )

  private buildLocaleParams(
    locale: string | undefined
  ): Record<string, string> {
    return locale ? { locale } : {}
  }

  private buildListParams(params: ListEntriesParams): Record<string, string> {
    const query: Record<string, string> = this.buildLocaleParams(params.locale)
    if (params.scroll) {
      query.scroll = params.scroll
    }
    return query
  }

  private async getJson<T>(
    path: string,
    params: Record<string, string>,
    etag: string | undefined,
    metric: string
  ): Promise<DataPlaneListResponse<T>> {
    const headers: Record<string, string> = {}
    if (etag) {
      headers['If-None-Match'] = etag
    }

    return withRetriableGet({
      getStatus: (error: unknown) =>
        (error as { response?: { status?: number } })?.response?.status,
      metric,
      request: async () => {
        const response = await this.http.getRaw<T>(path, {
          headers,
          metric,
          params,
          validateStatus: status =>
            status === 200 || status === 304 || status === 404,
        })
        if (isNotModified(response.status)) {
          return { etag, notModified: true }
        }
        if (isNotFound(response.status)) {
          return { notFound: true, notModified: false }
        }
        const newEtag =
          (response.headers?.etag as string | undefined) ?? etag
        return {
          data: response.data,
          etag: newEtag,
          notModified: false,
        }
      },
    })
  }
}
