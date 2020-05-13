/* eslint-disable no-await-in-loop */
import { path } from 'ramda'

import { Internal } from 'vtex.rewriter'
import { CONFIG_BUCKET, CONFIG_FILE, getBucket, hashString, TENANT_CACHE_TTL_S } from '../../utils'
import { currentDate, DEFAULT_CONFIG, DEFAULT_EVENT, GENERATE_USER_ROUTES_EVENT, SitemapEntry, SitemapIndex, sleep, USER_ROUTES_INDEX } from './utils'

const LIST_LIMIT = 300

const initializeSitemap = async (ctx: EventContext) => {
  const { tenant, vbase } = ctx.clients
  const { bindings } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })

  const config = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG
  await Promise.all(bindings.map(
    binding => vbase.saveJSON<SitemapIndex>(getBucket(config.generationPrefix, hashString(binding.id)), USER_ROUTES_INDEX, {
      index: [] as string[],
      lastUpdated: '',
    })
  ))
}

export async function generateUserRoutes(ctx: EventContext) {
  if (!ctx.body.count) {
    await initializeSitemap(ctx)
  }
  const { clients: { events, vbase, rewriter, meta }, body, vtex: { logger } } = ctx
  const {generationPrefix, productionPrefix } = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG
  const {
    count,
    next,
    report,
  }: SitemapGenerationEvent = !body.count
  ? DEFAULT_EVENT
  : body
  logger.debug({
    message: '[User Routes] Event received',
    payload: {
      count,
      next,
      report,
    },
  })

  const response = await rewriter.listInternals(LIST_LIMIT, next)
  await meta.makeMetaRequest()
  const routes: Internal[] = response.routes || []
  const responseNext = response.next

  const routesByBinding = routes.reduce(
    (acc, internal) => {
      if (internal.type === 'userRoute') {
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
    const payload: SitemapGenerationEvent = {
      count: count + 1,
      next: responseNext,
      report,
    }
    await sleep(300)
    events.sendEvent('', GENERATE_USER_ROUTES_EVENT, payload)
    logger.debug({ message: '[User Routes] Event sent', payload, })
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
