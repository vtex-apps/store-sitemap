import { Tenant, VBase } from '@vtex/api'
import { Product, SalesChannel } from 'vtex.catalog-graphql'

import { Messages } from '../../clients/messages'
import { CONFIG_BUCKET, GENERATION_CONFIG_FILE, getBucket, hashString, STORE_PRODUCT, TENANT_CACHE_TTL_S } from '../../utils'

export const RAW_DATA_PREFIX = 'C'

export const REWRITER_ROUTES_INDEX = 'rewriterRoutesIndex.json'
export const PRODUCT_ROUTES_INDEX = 'productRoutesIndex.json'

export const GENERATE_SITEMAP_EVENT = 'sitemap.generate'
export const GENERATE_REWRITER_ROUTES_EVENT = 'sitemap.generate:rewriter-routes'
export const GENERATE_PRODUCT_ROUTES_EVENT = 'sitemap.generate:product-routes'
export const GROUP_ENTRIES_EVENT = 'sitemap.generate:group-entries'

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

export interface Message {
  content: string
  context: string
}

export const createFileName = (entity: string, count: number) => `${entity}-${count}`

export const splitFileName = (file: string) => file.split('-')

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const currentDate = (): string => new Date().toISOString()

export const initializeSitemap = async (ctx: EventContext, indexFile: string) => {
  const { tenant, vbase } = ctx.clients
  const { bindings } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })

  await Promise.all(bindings.map(
    binding => vbase.saveJSON<SitemapIndex>(getBucket(RAW_DATA_PREFIX, hashString(binding.id)), indexFile, {
      index: [] as string[],
      lastUpdated: '',
    })
  ))
}


export const filterBindingsBySalesChannel = (
  tenantInfo: Tenant,
  salesChannels: Product['salesChannel']
): Tenant['bindings'] => {
  const salesChannelsSet = salesChannels?.reduce((acc: Set<string>, sc: Maybe<SalesChannel>) => {
    if (sc?.id) {
      acc.add(sc.id)
    }
    return acc
  }, new Set<string>())

  return tenantInfo.bindings.filter(binding => {
    if (binding.targetProduct === STORE_PRODUCT) {
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

export const createTranslator = (service: Messages) => async (
  from: string,
  to: string,
  messages: Message[]
): Promise<string[]> => {
  if (from.toLowerCase() === to.toLowerCase()) {
    return messages.map(({ content }) => content)
  }
  const translations = await service.translateNoCache({
    indexedByFrom: [
      {
        from,
        messages,
      },
    ],
    to,
  })
  return translations
}


export const isSitemapComplete = async (vbase: VBase) => {
  const [
    isProductsRoutesComplete,
    isRewriterRoutesComplete,
  ] = await Promise.all([
    vbase.getJSON(CONFIG_BUCKET, PRODUCT_ROUTES_INDEX, true),
    vbase.getJSON(CONFIG_BUCKET, REWRITER_ROUTES_INDEX, true),
  ])
  return isProductsRoutesComplete && isRewriterRoutesComplete
}

export const completeRoutes = async (file: string, vbase: VBase) =>
  vbase.saveJSON(CONFIG_BUCKET, file, 'OK')

export const cleanConfigBucket = async (vbase: VBase) =>
  Promise.all([
    vbase.deleteFile(CONFIG_BUCKET, GENERATION_CONFIG_FILE),
    vbase.deleteFile(CONFIG_BUCKET, PRODUCT_ROUTES_INDEX),
    vbase.deleteFile(CONFIG_BUCKET, REWRITER_ROUTES_INDEX),
  ])
