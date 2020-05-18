import { Tenant } from '@vtex/api'
import { Product } from 'vtex.catalog-graphql'

import { CONFIG_BUCKET, CONFIG_FILE, getBucket, hashString, TENANT_CACHE_TTL_S } from '../../utils'

export const USER_ROUTES_INDEX = 'userRoutesIndex.json'
export const PRODUCT_ROUTES_INDEX = 'productRoutesIndex.json'

export const GENERATE_SITEMAP_EVENT = 'sitemap.generate'
export const GENERATE_USER_ROUTES_EVENT = 'sitemap.generate:user-routes'
export const GENERATE_PRODUCT_ROUTES_EVENT = 'sitemap.generate:product-routes'

export const DEFAULT_CONFIG: Config = {
  generationPrefix: 'B',
  productionPrefix: 'A',
}

export interface SitemapIndex {
  index: string[]
  lastUpdated: string
}

export interface SitemapEntry {
  routes: Route[]
  lastUpdated: string
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const currentDate = (): string => new Date().toISOString()


export const initializeSitemap = async (ctx: EventContext, indexFile: string) => {
  const { tenant, vbase } = ctx.clients
  const { bindings } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })

  const config = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG
  await Promise.all(bindings.map(
    binding => vbase.saveJSON<SitemapIndex>(getBucket(config.generationPrefix, hashString(binding.id)), indexFile, {
      index: [] as string[],
      lastUpdated: '',
    })
  ))
}


export const filterBindingsBySalesChannel = (
  tenantInfo: Tenant,
  salesChannels: Product['salesChannel']
): Tenant['bindings'] => {
  const salesChannelsSet = salesChannels?.reduce((acc: Set<string>, sc: Product['salesChannel']) => {
    if (sc?.id) {
      acc.add(sc.id)
    }
    return acc
  }, new Set<string>())

  return tenantInfo.bindings.filter(binding => {
    if (binding.targetProduct === 'vtex-storefront') {
      const bindingSC: number | undefined =
        binding.extraContext.portal?.salesChannel
      const productActiveInBindingSC =
        bindingSC && salesChannelsSet?.has(bindingSC.toString())
      if (productActiveInBindingSC || !salesChannelsSet) {
        return true
      }
    }
    return false
  })
}

export const slugify = (str: string) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*+~.()'"!:@&\[\]`,/ %$#?{}|><=_^]/g, '-')
