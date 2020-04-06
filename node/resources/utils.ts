import { TenantClient } from '@vtex/api'

const STORE_PRODUCT = 'vtex-storefront'

export const notFound = <T>(fallback: T) => (error: any): T => {
  if (error.response && error.response.status === 404) {
    return fallback
  }
  throw error
}

export const currentDate = (): string => new Date().toISOString().split('T')[0]

export class SitemapNotFound extends Error {}

export const SITEMAP_URL = '(/:bindingIdentifier)/sitemap/:path'

export const getStoreBindings = async (tenant: TenantClient) => {
  const tenantInfo = await tenant.info()
  return tenantInfo.bindings.filter(
    binding => binding.targetProduct === STORE_PRODUCT
  )
}

export const hashString = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash += (str.charCodeAt(i) * 31) ** (str.length - i)
    // tslint:disable-next-line:no-bitwise
    hash &= hash
  }
  return hash
}
