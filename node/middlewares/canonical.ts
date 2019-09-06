import { Functions } from '@gocommerce/utils'
import { json as parseBody } from 'co-body'
import { parse as parseQs } from 'querystring'
import { prop } from 'ramda'

import { isSearch, precedence, removeQuerystring, Route, routeIdToStoreRoute } from '../resources/route'

interface CleanPathAndQuery {
  path: string
  query: string
}

const getCleanPathAndRelevantQuery = (path: string): CleanPathAndQuery => {
  const slashFreePath = path.split('/')[1] || path
  const queryIndex = slashFreePath.indexOf('?')
  if (queryIndex === -1) {
    return {path: slashFreePath, query: ''}
  }

  const queryString = slashFreePath.substr(queryIndex + 1).toLowerCase()
  const query = parseQs(queryString)
  return {
    path: slashFreePath.substr(0, queryIndex),
    query: query.map ? `?map=${query.map}` : '',
  }
}

const routeTypeToStoreRoute: any = {
  'Brand': (path: string, query: string) => ({
    ...routeIdToStoreRoute.brands,
    domain: 'store',
    params: {
      p1: path,
    },
    path:`${path}/b${query}`,
  }),
  'Department': (path: string, query: string) => ({
    ...routeIdToStoreRoute.departments,
    domain: 'store',
    params: {
      p1: path,
    },
    path:`${path}/d${query}`,
  }),
  'FullText': (path: string, query: string) => ({
    domain: 'store',
    id: 'store.search',
    params: {
      p1: path,
    },
    path:`${path}/s${query}`,
    pathId: '/:p1/s',
  }),
}

const routeFromCatalogPageType = (
  catalogPageTypeResponse: CatalogPageTypeResponse,
  canonicalPath: string,
  query: string
) => {
  const pageType = prop('pageType', catalogPageTypeResponse)
  const routeGenerator = routeTypeToStoreRoute[pageType] || routeTypeToStoreRoute.FullText
  return routeGenerator(canonicalPath, query)
}

export async function getCanonical (ctx: Context) {
  const { clients: { canonicals, catalog }, vtex: { logger }, query: { canonicalPath } } = ctx
  const { path: cleanPath, query } = getCleanPathAndRelevantQuery(canonicalPath)
  const isGoCommerce = Functions.isGoCommerceAcc(ctx)

  const vbaseRoute = await canonicals.load(`/${cleanPath}`)

  const pageType = !isGoCommerce
    ? await catalog.pageType(cleanPath, query).catch(_ => null) || { pageType: 'FullText' }
    : { pageType: 'FullText' }

  const catalogRoute = routeFromCatalogPageType(
    pageType,
    cleanPath,
    query
  )

  if (!isGoCommerce && vbaseRoute) {
    const vbaseRoutePath = prop('path', vbaseRoute)
    const catalogRoutePath = prop('path', catalogRoute)

    logger.debug(
      `catalog pagetype API returned route path ${catalogRoutePath} but route stored in vbase was ${vbaseRoutePath}`
    )
  }

  const shouldUseVbase = vbaseRoute && catalogRoute.id === 'store.search'
  ctx.body = shouldUseVbase ? vbaseRoute : catalogRoute
  ctx.status = 200
  ctx.set('content-type', 'application/json')

  ctx.set('cache-control', 'no-cache, no-store')
}

export async function saveCanonical (ctx: Context) {
  const {clients: {canonicals}} = ctx
  const newRoute = Route.from(await parseBody(ctx))
  const {canonical: canonicalPath} = newRoute
  const path = removeQuerystring(canonicalPath)
  const savedRoute = await canonicals.load(path)
  if (!isSearch(newRoute) && (!savedRoute || precedence(newRoute, savedRoute))) {
    await canonicals.save(newRoute)
  }

  ctx.status = 204
}
