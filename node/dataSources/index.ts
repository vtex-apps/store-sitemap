import { Apps, Logger } from '@vtex/api'
import { DataSource } from 'apollo-datasource'
import { InMemoryLRUCache } from 'apollo-server-caching'
import { Dictionary, forEachObjIndexed } from 'ramda'

import { Context } from '../utils/helpers'
import { Canonicals } from './canonicals'
import { Robots } from './robots'
import { Routes } from './routes'
import { SiteMap } from './sitemap'

const TEN_SECONDS_MS = 10 * 1000
const THREE_SECONDS_MS = 10 * 1000

export interface DataSources extends Dictionary<DataSource<Context>> {
  apps: Apps,
  canonicals: Canonicals,
  logger: Logger,
  robots: Robots,
  routes: Routes
  sitemap: SiteMap,
}

export const dataSources = (): DataSources => ({
  apps: new Apps(undefined, {timeout: THREE_SECONDS_MS}),
  canonicals: new Canonicals(undefined, {timeout: TEN_SECONDS_MS}),
  logger: new Logger(undefined, {timeout: THREE_SECONDS_MS}),
  robots: new Robots(),
  routes: new Routes(undefined, {timeout: THREE_SECONDS_MS}),
  sitemap: new SiteMap(),
})

const cache = new InMemoryLRUCache({
  maxSize: 100,
})

export const initialize = (context: Context) => forEachObjIndexed<DataSource<Context>, DataSources>(
  (dataSource) => dataSource && dataSource.initialize && dataSource.initialize({context, cache}),
  context.dataSources
)
