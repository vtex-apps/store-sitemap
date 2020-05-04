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


const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const currentDate = (): string => new Date().toISOString().split('T')[0]

const generate = async (ctx: Context | EventContext) => {
  const { vbase, rewriter } = ctx.clients

  let response
  let next: Maybe<string>

  let count = 0
  let brands = 0
  let productRoutes = 0
  let userRoutes = 0
  let categories = 0
  let departments = 0
  let subcategories = 0
  let rest = 0

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
          switch (internal.type) {
            case 'product':
              productRoutes++
              break
            case 'department':
              departments++
              break
            case 'category':
              categories++
              break
            case 'subcategory':
              subcategories++
              break
            case 'userRoute':
              userRoutes++
              break
            case 'brand':
              brands++
              break
            default:
              rest++
              break
          }
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
    await sleep(300)
  } while (next)
  ctx.vtex.logger.info({
    brands,
    categories,
    departments,
    message: 'Sitemap complete',
    productRoutes,
    rest,
    subcategories,
    userRoutes,
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

  await Promise.all(bindings.map(
    binding => vbase.saveJSON<SitemapIndex>(hashString(binding.id), SITEMAP_INDEX, {
      index: [] as string[],
      lastUpdated: '',
    })
  ))
  generate(ctx)
}
