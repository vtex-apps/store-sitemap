/* eslint-disable no-await-in-loop */
import { path, startsWith } from 'ramda'

import { Internal } from 'vtex.rewriter'
import { CONFIG_BUCKET, CONFIG_FILE, getBucket, hashString, TENANT_CACHE_TTL_S } from '../utils'

export const SITEMAP_INDEX = 'sitemap_index'
export const GENERATE_SITEMAP_EVENT = 'sitemap.generate'

const LIST_LIMIT = 300

export interface SitemapIndex {
  index: string[]
  lastUpdated: string
}

export interface SitemapEntry {
  routes: Internal[]
  lastUpdated: string
}

const DEFAULT_CONFIG: Config = {
  generationPrefix: 'B',
  productionPrefix: 'A',
}

const DEFAULT_EVENT: SitemapGenerationEvent = {
  count: 0,
  next: null,
  report: {},
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const currentDate = (): string => new Date().toISOString().split('T')[0]

const initializeSitemap = async (ctx: EventContext) => {
  const { tenant, vbase } = ctx.clients
  const { bindings } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })

  const config = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG
  await Promise.all(bindings.map(
    binding => vbase.saveJSON<SitemapIndex>(getBucket(config.generationPrefix, hashString(binding.id)), SITEMAP_INDEX, {
      index: [] as string[],
      lastUpdated: '',
    })
  ))
}

const generate = async (ctx: EventContext) => {
  if (!ctx.body.count) {
    await initializeSitemap(ctx)
  }
  const { clients: { events,vbase, rewriter }, body, vtex: { logger } } = ctx
  const {generationPrefix, productionPrefix } = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG
  const {
    count,
    next,
    report,
  }: SitemapGenerationEvent = !body.count
  ? DEFAULT_EVENT
  : body
  logger.debug({
    message: 'Event received',
    payload: {
      count,
      next,
      report,
    },
  })

  const response = await rewriter.listInternals(LIST_LIMIT, next)
  // Call meta?
  const routes: Internal[] = response.routes || []
  const responseNext = response.next

  const routesByBinding = routes.reduce(
    (acc, internal) => {
      if (!startsWith('notFound', internal.type) && internal.id !== 'search') {
        report[internal.type] = (report[internal.type] || 0) + 1
        const { binding } = internal
        const bindingRoutes: Internal[] = path([binding, internal.type], acc) || []
        acc[binding] = {
          ...acc[binding] || {},
          [internal.type]: bindingRoutes.concat(internal),
        }
      }
      return acc
    },
    {} as Record<string, Record<string, Internal[]>>
  )

  await Promise.all(
    Object.keys(routesByBinding).map(async bindingId => {
      const bucket = getBucket(generationPrefix, hashString(bindingId))
      const groupedRoutes = routesByBinding[bindingId]
      // Call meta?
      await Promise.all(
        Object.keys(groupedRoutes).map(async entityType => {
          const entityRoutes = routesByBinding[bindingId][entityType]
          const entry = `${entityType}-${count}`
          const indexData = await vbase.getJSON<SitemapIndex>(bucket, SITEMAP_INDEX, true)
          const { index } = indexData as SitemapIndex
          index.push(entry)
          const lastUpdated = currentDate()
          await Promise.all([
            vbase.saveJSON<SitemapIndex>(bucket, SITEMAP_INDEX, {
              index,
              lastUpdated,
            }),
            vbase.saveJSON<SitemapEntry>(bucket, entry, {
              lastUpdated,
              routes: entityRoutes,
            }),
          ])
        })
      )
    })
  )

  if (responseNext) {
    const payload: SitemapGenerationEvent = {
      count: count + 1,
      next: responseNext,
      report,
    }
    await sleep(300)
    events.sendEvent('', GENERATE_SITEMAP_EVENT, payload)
    logger.debug({ message: 'Event sent', payload, })
  } else {
    await vbase.saveJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, {
      generationPrefix: productionPrefix,
      productionPrefix: generationPrefix,
    })
    ctx.vtex.logger.info({
      message: 'Sitemap complete',
      report,
    })
  }
}

export async function generateSitemapFromREST(ctx: Context) {
  const { events } = ctx.clients
  events.sendEvent('', GENERATE_SITEMAP_EVENT)
  ctx.status = 200
}

export async function generateSitemap(ctx: EventContext) {
  generate(ctx)
}
