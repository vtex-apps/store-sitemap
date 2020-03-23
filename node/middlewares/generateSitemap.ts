import { startsWith } from 'ramda'

/* eslint-disable no-await-in-loop */
export const SITEMAP_BUCKET = '_SITEMAP_'
export const SITEMAP_INDEX = 'sitemap_index'
export const GENERATE_SITEMAP_EVENT = 'sitemap.generate'
const LIST_LIMIT = 500

const currentDate = (): string => new Date().toISOString().split('T')[0]

const generate = async (ctx: Context) => {
  const { vbase, rewriter } = ctx.clients
  let response
  let from = 0
  let next: Maybe<string>
  await vbase.saveJSON(SITEMAP_BUCKET, SITEMAP_INDEX, { index: [] })
  do {
    response = await rewriter.listInternals(LIST_LIMIT, next)
    const length: number = response.routes?.length
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
    const index = await vbase.getJSON<string[]>(
      SITEMAP_BUCKET,
      SITEMAP_INDEX,
      true
    )
    index.push(entry)
    const lastUpdated = currentDate()
    await Promise.all([
      vbase.saveJSON(SITEMAP_BUCKET, SITEMAP_INDEX, {
        index,
        lastUpdated,
      }),
      vbase.saveJSON(SITEMAP_BUCKET, entry, {
        lastUpdated,
        routes: list,
      }),
    ])
    from += length
  } while (next)
}

export async function generateSitemap(ctx: Context) {
  generate(ctx)

  ctx.status = 200
}
