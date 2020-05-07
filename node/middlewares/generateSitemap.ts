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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const currentDate = (): string => new Date().toISOString().split('T')[0]

const generate = async (ctx: Context | EventContext) => {
  const { state: { config }, clients: { vbase, rewriter } } = ctx

  const {generationPrefix, productionPrefix } = config!

  let response
  let next: Maybe<string>
  let count = 0

  const report: Record<string, number> = {}

  do {
    response = await rewriter.listInternals(LIST_LIMIT, next)
    const length: number = response.routes?.length ?? 0
    if (!response.routes || !length) {
      next = response.next
      continue
    }
    const routesByBinding = response.routes.reduce(
      (acc, internal) => {
        if (!startsWith('notFound', internal.type) && internal.id !== 'search') {
          report[internal.type] = (report[internal.type] || 0) + 1
          const { binding } = internal
          const routes: Internal[] = path([binding, internal.type], acc) || []
          acc[binding] = {
            ...acc[binding] || {},
            [internal.type]: routes.concat(internal),
          }
        }
        return acc
      },
      {} as Record<string, Record<string,Internal[]>>
    )

    await Promise.all(
      Object.keys(routesByBinding).map(async bindingId => {
        const bucket = getBucket(generationPrefix, hashString(bindingId))
        const groupedRoutes = routesByBinding[bindingId]
        await Promise.all(
          Object.keys(groupedRoutes).map(async entityType => {
            const routes = routesByBinding[bindingId][entityType]
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
                routes,
              }),
            ])
          })
        )
      })
    )

    count++
    next = response.next
    await sleep(300)
  } while (next)
  await vbase.saveJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, {
    generationPrefix: productionPrefix,
    productionPrefix: generationPrefix,
  })
  ctx.vtex.logger.info({
    message: 'Sitemap complete',
    report,
  })
}

export async function generateSitemapFromREST(ctx: Context) {
  generateSitemap(ctx)
  ctx.status = 200
}

export async function generateSitemap(ctx: Context | EventContext) {
  const { tenant, vbase } = ctx.clients
  const { bindings } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })

  const config = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG
  ctx.state.config = config
  await Promise.all(bindings.map(
    binding => vbase.saveJSON<SitemapIndex>(getBucket(config.generationPrefix, hashString(binding.id)), SITEMAP_INDEX, {
      index: [] as string[],
      lastUpdated: '',
    })
  ))
  generate(ctx)
}
