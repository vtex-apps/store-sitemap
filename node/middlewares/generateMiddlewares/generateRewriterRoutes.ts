import { path, startsWith } from 'ramda'

import { Internal } from 'vtex.rewriter'
import { CONFIG_BUCKET, CONFIG_FILE, getBucket, hashString } from '../../utils'
import {
  currentDate,
  DEFAULT_CONFIG,
  GENERATE_REWRITER_ROUTES_EVENT,
  initializeSitemap,
  SitemapEntry,
  SitemapIndex,
  sleep,
  USER_ROUTES_INDEX
} from './utils'

const LIST_LIMIT = 300



export async function generateRewriterRoutes(ctx: EventContext) {
  if (!ctx.body.count) {
    await initializeSitemap(ctx, USER_ROUTES_INDEX)
  }
  const { clients: { events, vbase, rewriter, meta }, body, vtex: { logger } } = ctx
  const {generationPrefix } = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG
  const {
    count,
    next,
    report,
  }: RewriterRoutesGenerationEvent = body!

  logger.debug({
    message: 'Event received',
    payload: {
      count,
      next,
      report,
    },
    type: 'user-routes',
  })

  const response = await rewriter.listInternals(LIST_LIMIT, next)
  await meta.makeMetaRequest()
  const routes: Internal[] = response.routes || []
  const responseNext = response.next

  const routesByBinding = routes.reduce(
    (acc, internal) => {
      report[internal.type] = (report[internal.type] || 0) + 1
      if (!startsWith('notFound', internal.type) && internal.id !== 'search') {
        const { binding } = internal
        const bindingRoutes: Route[] = path([binding, internal.type], acc) || []
        const route: Route = {
          imagePath: internal.imagePath || undefined,
          imageTitle: internal.imageTitle || undefined,
          path: internal.from,
        }
        acc[binding] = {
          ...acc[binding] || {},
          [internal.type]: bindingRoutes.concat(route),
        }
      }
      return acc
    },
    {} as Record<string, Record<string, Route[]>>
  )

  await Promise.all(
    Object.keys(routesByBinding).map(async bindingId => {
      const bucket = getBucket(generationPrefix, hashString(bindingId))
      const groupedRoutes = routesByBinding[bindingId]
      await meta.makeMetaRequest()
      await Promise.all(
        Object.keys(groupedRoutes).map(async entityType => {
          const entityRoutes = routesByBinding[bindingId][entityType]
          const entry = `${entityType}-${count}`
          const indexData = await vbase.getJSON<SitemapIndex>(bucket, USER_ROUTES_INDEX, true)
          const { index } = indexData as SitemapIndex
          index.push(entry)
          const lastUpdated = currentDate()
          await Promise.all([
            vbase.saveJSON<SitemapIndex>(bucket, USER_ROUTES_INDEX, {
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
    const payload: RewriterRoutesGenerationEvent= {
      count: count + 1,
      next: responseNext,
      report,
    }
    await sleep(300)
    events.sendEvent('', GENERATE_REWRITER_ROUTES_EVENT, payload)
    logger.debug({ message: 'Event sent', type: 'user-routes', payload, })
  } else {
    ctx.vtex.logger.info({
      message: 'User routes complete',
      report,
      type: 'user-routes',
    })
  }
}
