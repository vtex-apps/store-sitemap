import { json as parseBody } from 'co-body'

import { Route } from '../resources/route'
import { Context, Middleware } from '../utils/helpers'

const getCanonical: Middleware = async (ctx: Context) => {
  const {dataSources: {canonicals}, query: {canonicalPath}} = ctx
  const maybeRoute = await canonicals.load(canonicalPath)
  if (maybeRoute) {
    ctx.body = maybeRoute
    ctx.status = 200
    ctx.set('content-type', 'application/json')
  }
}

const saveCanonical: Middleware = async (ctx: Context) => {
  const {dataSources: {canonicals}} = ctx
  const canonicalRoute: Route = await parseBody(ctx)
  await canonicals.save(canonicalRoute)
  ctx.status = 204
}

const router: Record<string, Middleware> = {
  GET: getCanonical,
  PUT: saveCanonical,
}

export const canonical: Middleware = async (ctx: Context) => {
  const middleware = router[ctx.method.toUpperCase()]
  if (middleware) {
    return middleware(ctx)
  }
  ctx.status = 405
}
