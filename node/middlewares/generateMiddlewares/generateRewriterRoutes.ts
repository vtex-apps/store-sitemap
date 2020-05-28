import { path, startsWith } from 'ramda'

import { Internal } from 'vtex.rewriter'
import { getBucket, hashString } from '../../utils'
import {
  currentDate,
  GENERATE_REWRITER_ROUTES_EVENT,
  GROUP_ENTRIES_EVENT,
  initializeSitemap,
  RAW_DATA_PREFIX,
  REWRITER_ROUTES_INDEX,
  SitemapEntry,
  SitemapIndex
} from './utils'

const LIST_LIMIT = 300

export async function generateRewriterRoutes(ctx: EventContext, nextMiddleware: () => Promise<void>) {
  if (!ctx.body.count) {
    await initializeSitemap(ctx, REWRITER_ROUTES_INDEX)
  }
  const { clients: { vbase, rewriter }, body, vtex: { logger } } = ctx
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
  const routes: Internal[] = response.routes || []
  const responseNext = response.next

  const routesByBinding = routes.reduce(
    (acc, internal) => {
      report[internal.type] = (report[internal.type] || 0) + 1
      if (!startsWith('notFound', internal.type) && internal.type !== 'product') {
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
      const bucket = getBucket(RAW_DATA_PREFIX, hashString(bindingId))
      const groupedRoutes = routesByBinding[bindingId]
      const newEntries = await Promise.all(
        Object.keys(groupedRoutes).map(async entityType => {
          const entityRoutes = routesByBinding[bindingId][entityType]
          const entry = `${entityType}-${count}`
          const lastUpdated = currentDate()
          await vbase.saveJSON<SitemapEntry>(bucket, entry, {
              lastUpdated,
              routes: entityRoutes,
          })
          return entry
        })
      )
      const { index } = await vbase.getJSON<SitemapIndex>(bucket, REWRITER_ROUTES_INDEX, true)
      await vbase.saveJSON<SitemapIndex>(bucket, REWRITER_ROUTES_INDEX, {
        index: [...index, ...newEntries],
        lastUpdated: currentDate(),
      })
    })
  )

  if (responseNext) {
    const payload: RewriterRoutesGenerationEvent = {
      count: count + 1,
      next: responseNext,
      report,
    }
    ctx.state.nextEvent = {
      event: GENERATE_REWRITER_ROUTES_EVENT,
      payload,
    }
  } else {
    ctx.vtex.logger.info({
      message: 'User routes complete',
      report,
      type: GENERATE_REWRITER_ROUTES_EVENT,
    })
    ctx.state.nextEvent = {
      event: GROUP_ENTRIES_EVENT,
      payload: {
        indexFile: REWRITER_ROUTES_INDEX,
      },
    }
  }
  await nextMiddleware()
}
