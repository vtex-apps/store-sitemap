import { Binding, LINKED, Logger, Tenant, VBase } from '@vtex/api'
import { uniqBy } from 'ramda'
import { Product, SalesChannel } from 'vtex.catalog-graphql'

import { Messages } from '../../clients/messages'
import {
  CONFIG_BUCKET,
  getBucket,
  hashString,
  TENANT_CACHE_TTL_S,
} from '../../utils'

export const RAW_DATA_PREFIX = `${LINKED ? 'L' : ''}C`

export const REWRITER_ROUTES_INDEX = 'rewriterRoutesIndex.json'
export const PRODUCT_ROUTES_INDEX = 'productRoutesIndex.json'
export const APPS_ROUTES_INDEX = 'appsRoutesIndex.json'

export const GENERATE_SITEMAP_EVENT = 'sitemap.generate'
export const GENERATE_REWRITER_ROUTES_EVENT = 'sitemap.generate:rewriter-routes'
export const GENERATE_PRODUCT_ROUTES_EVENT = 'sitemap.generate:product-routes'
export const GENERATE_APPS_ROUTES_EVENT = 'sitemap.generate:apps-routes'
export const GROUP_ENTRIES_EVENT = 'sitemap.generate:group-entries'

export const DEFAULT_CONFIG: Config = {
  generationPrefix: `${LINKED ? 'L' : ''}B`,
  productionPrefix: `${LINKED ? 'L' : ''}A`,
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

export const uniq = <T>(array: T[]) =>
  array.filter((value, idx) => array.indexOf(value) === idx)

export const createFileName = (entity: string, count: number) =>
  `${entity}-${count}`

export const splitFileName = (file: string) => file.split('-')

export const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms))

export const currentDate = (): string => new Date().toISOString()

export const initializeSitemap = async (
  ctx: EventContext,
  indexFile: string
) => {
  const { tenant, vbase } = ctx.clients
  const { bindings } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })

  await Promise.all(
    bindings.map(binding =>
      vbase.saveJSON<SitemapIndex>(
        getBucket(RAW_DATA_PREFIX, hashString(binding.id)),
        indexFile,
        {
          index: [] as string[],
          lastUpdated: '',
        }
      )
    )
  )
}

export const getAccountSalesChannels = (
  bindings: Binding[]
): string[] | undefined => {
  const salesChannels = bindings.reduce((acc, binding) => {
    const bindingSC: number | undefined =
      binding.extraContext.portal?.salesChannel
    if (bindingSC) {
      acc.push(bindingSC.toString())
    }
    return acc
  }, [] as string[])
  // Has one binding with one sales channel
  if (bindings.length === 1 && salesChannels.length === 1) {
    return
  }
  return uniqBy(i => i, salesChannels)
}

export const filterBindingsBySalesChannel = (
  storeBindings: Binding[],
  salesChannels: Product['salesChannel']
): Tenant['bindings'] => {
  const salesChannelsSet = salesChannels?.reduce(
    (acc: Set<string>, sc: Maybe<SalesChannel>) => {
      if (sc?.id) {
        acc.add(sc.id)
      }
      return acc
    },
    new Set<string>()
  )

  return storeBindings.filter(binding => {
    const bindingSC: number | undefined =
      binding.extraContext.portal?.salesChannel
    const productActiveInBindingSC =
      bindingSC && salesChannelsSet?.has(bindingSC.toString())
    if (productActiveInBindingSC || !salesChannelsSet) {
      return true
    }
    return false
  })
}

export const slugify = (str: string) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*+~.()'"!:@&[\]`,/ %$#?{}|><=_^]/g, '-')

export type Translator = (
  from: string,
  to: string,
  messages: Message[]
) => Promise<string[]>

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

const allTruthy = <T>(array: T[]) => !array.some(e => !e)

export const isSitemapComplete = async (
  enabledIndexFiles: string[],
  vbase: VBase,
  logger: Logger
) => {
  const indexFiles = await Promise.all(
    enabledIndexFiles.map(indexFile =>
      vbase.getJSON(CONFIG_BUCKET, indexFile, true)
    )
  )
  logger.debug({
    enabledIndexFiles,
    indexFiles,
  })
  return allTruthy(indexFiles)
}

export const completeRoutes = async (file: string, vbase: VBase) =>
  vbase.saveJSON(CONFIG_BUCKET, file, 'OK')

export const cleanConfigBucket = async (
  enabledIndexFiles: string[],
  vbase: VBase
) =>
  Promise.all([
    ...enabledIndexFiles.map(indexFile =>
      vbase.deleteFile(CONFIG_BUCKET, indexFile)
    ),
  ])
