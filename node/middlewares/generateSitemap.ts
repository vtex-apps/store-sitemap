/* eslint-disable no-await-in-loop */
import { Binding } from '@vtex/api'
import { startsWith } from 'ramda'

import { Internal } from '../clients/rewriter'
import { getStoreBindings, hashString } from '../resources/utils'

export const SITEMAP_BUCKET = '_SITEMAP_'
export const SITEMAP_INDEX = 'sitemap_index'
export const GENERATE_SITEMAP_EVENT = 'sitemap.generate'
const LIST_LIMIT = 500

export interface SitemapIndex {
  index: string[]
  lastUpdated: string
}

export interface SitemapEntry {
  routes: Internal[]
  lastUpdated: string
}

const currentDate = (): string => new Date().toISOString().split('T')[0]

const generate = async (ctx: Context | EventContext, binding: Binding) => {
  const { vbase, rewriter, tenant } = ctx.clients
  const hasMultipleStoreBindings = await getStoreBindings(tenant).then(
    res => res.length > 1
  )
  const bucket = hasMultipleStoreBindings
    ? `${hashString(binding.id)}`
    : SITEMAP_BUCKET

  let response
  let from = 0
  let next: Maybe<string>
  await vbase.saveJSON<SitemapIndex>(bucket, SITEMAP_INDEX, {
    index: [] as string[],
    lastUpdated: '',
  })
  do {
    response = await rewriter.listInternals(LIST_LIMIT, next)
    const length: number = response.routes?.length ?? 0
    if (!response.routes || !length) {
      next = response.next
      continue
    }
    const list = response.routes.filter(
      internal =>
        !startsWith('notFound', internal.type) && internal.id !== 'search'
    )

    next = response.next

    const to = from + length
    const entry = `sitemap-${from}-${to}`
    const indexData = await vbase.getJSON<SitemapIndex>(bucket, SITEMAP_INDEX)
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
        routes: list,
      }),
    ])
    from += length
  } while (next)
}

export async function generateSitemapFromREST(ctx: Context) {
  await generateSitemap(ctx)
  ctx.status = 200
}

export async function generateSitemap(ctx: Context | EventContext) {
  const { tenant } = ctx.clients
  const { bindings } = await tenant.info()

  bindings.forEach(
    binding =>
      binding.targetProduct === 'vtex-storefront' && generate(ctx, binding)
  )
}
