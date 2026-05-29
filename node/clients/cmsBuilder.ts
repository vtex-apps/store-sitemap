import { ExternalClient, InstanceOptions, IOContext } from '@vtex/api'

import { withRetriableGet } from './httpRetry'

/**
 * Read-only client for the VTEX Headless CMS (legacy) builder REST API.
 */

const CMS_API_PATH = '/_v/cms/api'
const DEFAULT_PER_PAGE = 100

export interface CmsPageSeo {
  slug?: string
  title?: string
  description?: string
  canonical?: string
}

export interface CmsPage {
  id: string
  name: string
  type: string
  status: string
  versionId?: string
  versionStatus?: string
  settings?: {
    seo?: CmsPageSeo
  }
}

export interface ListPagesResponse {
  data: CmsPage[]
  hasNextPage: boolean
  totalItems: number
}

export interface ContentType {
  id: string
  name: string
  scopes?: string[]
  isSingleton?: boolean
}

export interface ListContentTypesResponse {
  contentTypes: ContentType[]
}

export interface ListPagesParams {
  projectId: string
  contentType: string
  page: number
  perPage?: number
}

export class CmsBuilder extends ExternalClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(`http://${context.account}.myvtex.com`, context, {
      ...(options ?? {}),
      headers: {
        ...(options?.headers ?? {}),
        Accept: 'application/json',
        VtexIdclientAutCookie: context.authToken,
      },
    })
  }

  public listContentTypes = (
    projectId: string
  ): Promise<ListContentTypesResponse> =>
    this.getJson<ListContentTypesResponse>(
      `${CMS_API_PATH}/${projectId}`,
      {},
      'cms-builder-list-content-types'
    )

  public listPages = (params: ListPagesParams): Promise<ListPagesResponse> =>
    this.getJson<ListPagesResponse>(
      `${CMS_API_PATH}/${params.projectId}/${params.contentType}`,
      {
        page: String(params.page),
        perPage: String(params.perPage ?? DEFAULT_PER_PAGE),
      },
      'cms-builder-list-pages'
    )

  public listAllPages = async (
    projectId: string,
    contentType: string,
    maxPages = 100
  ): Promise<CmsPage[]> => {
    const all: CmsPage[] = []
    let page = 1
    let hasNextPage = false
    do {
      // eslint-disable-next-line no-await-in-loop
      const response = await this.listPages({ contentType, page, projectId })
      all.push(...(response.data ?? []))
      hasNextPage = Boolean(response.hasNextPage)
      page += 1
    } while (hasNextPage && page <= maxPages)
    return all
  }

  private getJson<T>(
    path: string,
    params: Record<string, string>,
    metric: string
  ): Promise<T> {
    return withRetriableGet({
      getStatus: (error: unknown) =>
        (error as { response?: { status?: number } })?.response?.status,
      metric,
      request: () => this.http.get<T>(path, { metric, params }),
    })
  }
}
