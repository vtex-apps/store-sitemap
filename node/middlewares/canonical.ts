import { json as parseBody } from 'co-body'
import { prop, split, toLower } from 'ramda'

import { isSearch, precedence, removeQuerystring, Route } from '../resources/route'

const isVtex = (platform: string | undefined) => platform && toLower(platform) === 'vtex'

const cleanParam = (path: string) => split('/', path)[1]

const routeTypeToStoreRoute: any = {
  'Brand': (path: string) => ({
    domain: 'store',
    id: 'store.search#brand',
    params: {
      brand:  cleanParam(path),
    },
    path:`${path}/b`,
    pathId: '/:brand/b',
  }),
  'Department': (path: string) => ({
    domain: 'store',
    id: 'store.search#department',
    params: {
      department: cleanParam(path),
    },
    path:`${path}/d`,
    pathId: '/:department/d',
  }),
  'FullText': (path: string) => ({
    domain: 'store',
    id: 'store.search',
    params: {
      p1:  cleanParam(path),
    },
    path:`${path}/s`,
    pathId: '/:p1/s',
  }),
}

async function routeFromCatalogPageType (
  catalogPageTypeResponse: CatalogPageTypeResponse,
  canonicalPath: string) {
  console.log(catalogPageTypeResponse)
  const pageType = prop('pageType', catalogPageTypeResponse)
  const routeFunction = routeTypeToStoreRoute[pageType] || routeTypeToStoreRoute.FullText
  return routeFunction(canonicalPath)
}

export const getCanonical: Middleware = async (ctx: Context) => {
  const {clients: {canonicals, catalog}, query: {canonicalPath}, state: {platform}} = ctx
  const path = removeQuerystring(canonicalPath)
  let maybeRoute = await canonicals.load(path)
  console.log(`isVtex? ` + isVtex(platform))
  if (isVtex(platform)) {
    const catalogRoute = await routeFromCatalogPageType(await catalog.pageType(canonicalPath), canonicalPath)
    console.log(`catalog route: ` + JSON.stringify(catalogRoute, null, 2))
    console.log(`vbase route: ` + JSON.stringify(maybeRoute, null, 2))
    maybeRoute = catalogRoute
  }
  if (maybeRoute) {
    ctx.body = maybeRoute
    ctx.status = 200
    ctx.set('content-type', 'application/json')
  }
}

export const saveCanonical: Middleware = async (ctx: Context) => {
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
