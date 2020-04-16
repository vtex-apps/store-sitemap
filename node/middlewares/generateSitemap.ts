/* eslint-disable no-await-in-loop */
import { startsWith } from 'ramda'

import { Internal } from 'vtex.rewriter'
import { hashString, TENANT_CACHE_TTL_S } from '../utils'

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

const currentDate = (): string => new Date().toISOString().split('T')[0]

const generate = async (ctx: Context | EventContext) => {
  const { vbase, rewriter } = ctx.clients

  let response
  let next: Maybe<string>
  let count = 0

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
          const { binding } = internal
          const bindingRoutes = acc[binding] || []
          acc[binding] = bindingRoutes.concat(internal)
        }
        return acc
      },
      {} as Record<string, Internal[]>
    )

    await Promise.all(
      Object.keys(routesByBinding).map(async bindingId => {
        const bucket = hashString(bindingId)
        const routes = routesByBinding[bindingId]


        const entry = `sitemap-${count}`
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


    count++
    next = response.next
  } while (next)
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

  await Promise.all(bindings.map(
    binding => vbase.saveJSON<SitemapIndex>(hashString(binding.id), SITEMAP_INDEX, {
      index: [] as string[],
      lastUpdated: '',
    })
  ))
  generate(ctx)
}
