import { path, startsWith } from 'ramda'

import { Internal } from 'vtex.rewriter'
import { CONFIG_BUCKET, CONFIG_FILE, getBucket, hashString } from '../../utils'
import {
  createDataSaver,
  currentDate,
  DEFAULT_CONFIG,
  GENERATE_REWRITER_ROUTES_EVENT,
  initializeSitemap,
  REWRITER_ROUTES_INDEX,
  SitemapIndex
} from './utils'

const LIST_LIMIT = 300



export async function generateRewriterRoutes(ctx: EventContext, nextMiddleware: () => Promise<void>) {
  if (ctx.body.firstEvent) {
    await initializeSitemap(ctx, REWRITER_ROUTES_INDEX)
  }
  const { clients: { vbase, rewriter }, body, vtex: { logger } } = ctx
  const {generationPrefix } = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG
  const {
    entityCountByBinding,
    next,
    report,
  }: RewriterRoutesGenerationEvent = body!

  logger.debug({
    message: 'Event received',
    payload: {
      entityCountByBinding,
      next,
      report,
    },
    type: GENERATE_REWRITER_ROUTES_EVENT,
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
      const bucket = getBucket(generationPrefix, hashString(bindingId))
      const saveData = createDataSaver(vbase, bucket)
      const groupedRoutes = routesByBinding[bindingId]
      const entries = await Promise.all(
        Object.keys(groupedRoutes).map(async entityType => {
          const entityRoutes = routesByBinding[bindingId][entityType]
          const currentCount = entityCountByBinding[bindingId][entityType] || 0
          const lastUpdated = currentDate()
          const saveDataResponse = await saveData(entityType, currentCount, entityRoutes, lastUpdated)
          if (saveDataResponse) {
            const { count, entry } = saveDataResponse
            entityCountByBinding[bindingId][entityType] = count
            return entry
          }
          return
        })
      )
      const filteredEntries = entries.filter(entry => entry !== undefined) as string[]
      const { index } = await vbase.getJSON<SitemapIndex>(bucket, REWRITER_ROUTES_INDEX)

      await vbase.saveJSON<SitemapIndex>(bucket, REWRITER_ROUTES_INDEX, {
        index: [...index, ...filteredEntries],
        lastUpdated: currentDate(),
      })
    })
  )

  if (responseNext) {
    const payload: RewriterRoutesGenerationEvent= {
      entityCountByBinding,
      next: responseNext,
      report,
    }
    ctx.state.nextEvent = {
      event: GENERATE_REWRITER_ROUTES_EVENT,
      payload,
    }
    nextMiddleware()
  } else {
    ctx.vtex.logger.info({
      message: 'User routes complete',
      report,
      type: GENERATE_REWRITER_ROUTES_EVENT,
    })
  }
}
