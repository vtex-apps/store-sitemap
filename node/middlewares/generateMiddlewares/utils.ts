import { Internal } from 'vtex.rewriter'

export const USER_ROUTES_INDEX = 'userRoutesIndex.json'
export const GENERATE_SITEMAP_EVENT = 'sitemap.generate'
export const GENERATE_USER_ROUTES_EVENT = 'sitemap.generate:user-routes'

export const DEFAULT_CONFIG: Config = {
  generationPrefix: 'B',
  productionPrefix: 'A',
}

export interface SitemapIndex {
  index: string[]
  lastUpdated: string
}

export interface SitemapEntry {
  routes: Internal[]
  lastUpdated: string
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const currentDate = (): string => new Date().toISOString()

