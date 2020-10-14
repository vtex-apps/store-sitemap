import { Binding } from '@vtex/api'
import { path as Rpath, startsWith } from 'ramda'
import { Internal } from 'vtex.rewriter'

import { getBucket, getStoreBindings, hashString } from '../../utils'
import { Clients } from './../../clients/index'
import { Rewriter } from './../../clients/rewriter'
import {
  createFileName,
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

type RoutesByBinding = Record<string, Record<string, Route[]>>

const createRoutesByBinding = (routes: Internal[], report: Record<string, number>, storeBindings: Binding[]) => {
  const storeBindingsIds = storeBindings.map(({ id }) => id)
  return routes.reduce(
    (acc, internal) => {
      report[internal.type] = (report[internal.type] || 0) + 1
      const validRoute =
        !startsWith('notFound', internal.type) &&
        internal.type !== 'product' &&
        !internal.disableSitemapEntry &&
        storeBindingsIds.includes(internal.binding)
      if (validRoute) {
        const { binding } = internal
        const bindingRoutes: Route[] = Rpath([binding, internal.type], acc) || []
        const route: Route = {
          id: internal.id,
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
    {} as RoutesByBinding
  )
}

const completeRoute = (rewriter: Rewriter, type: string) => async (route: Route) => {
  const routesById = await rewriter.routesById({
    id: route.id,
    type,
  })
  const alternates = routesById.map(({ route: path, binding: bindingId }) => ({ path, bindingId }))
  return {
    ...route,
    alternates,
  }
}

const saveRoutes = (routesByBinding: RoutesByBinding, count: number, clients: Clients) => async (bindingId: string) => {
  const { vbase, rewriter } = clients
  const bucket = getBucket(RAW_DATA_PREFIX, hashString(bindingId))
  const groupedRoutes = routesByBinding[bindingId]
  const newEntries = await Promise.all(
    Object.keys(groupedRoutes).map(async entityType => {
      const entityRoutes = await Promise.all(
        routesByBinding[bindingId][entityType].map(completeRoute(rewriter, entityType))
      )
      const entry = createFileName(entityType, count)
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
}

export async function generateRewriterRoutes(ctx: EventContext, nextMiddleware: () => Promise<void>) {
  if (!ctx.body.count) {
    await initializeSitemap(ctx, REWRITER_ROUTES_INDEX)
  }
  const { clients: { rewriter, tenant } , body } = ctx
  const {
    count,
    generationId,
    next,
    report,
  }: RewriterRoutesGenerationEvent = body!

  const response = await rewriter.listInternals(LIST_LIMIT, next)
  const routes: Internal[] = response.routes || []
  const responseNext = response.next

  const storeBindings = await getStoreBindings(tenant)

  const routesByBinding = createRoutesByBinding(routes, report, storeBindings)

  await Promise.all(
    Object.keys(routesByBinding).map(saveRoutes(routesByBinding, count, ctx.clients))
  )

  if (responseNext) {
    const payload: RewriterRoutesGenerationEvent = {
      count: count + 1,
      generationId,
      next: responseNext,
      report,
    }
    ctx.state.nextEvent = {
      event: GENERATE_REWRITER_ROUTES_EVENT,
      payload,
    }
  } else {
    ctx.vtex.logger.info({
      message: 'Rewriter routes complete',
      report,
      type: GENERATE_REWRITER_ROUTES_EVENT,
    })
    ctx.state.nextEvent = {
      event: GROUP_ENTRIES_EVENT,
      payload: {
        from: 0,
        generationId,
        indexFile: REWRITER_ROUTES_INDEX,
      },
    }
  }
  await nextMiddleware()
}


