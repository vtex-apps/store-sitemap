import { json as parseBody } from 'co-body'

import { Route } from '../resources/route'

export const getCanonical: Middleware = async (ctx: Context) => {
  const {clients: {canonicals}, query: {canonicalPath}} = ctx
  const maybeRoute = await canonicals.load(canonicalPath)
  if (maybeRoute) {
    ctx.body = maybeRoute
    ctx.status = 200
    ctx.set('content-type', 'application/json')
  }
}

export const saveCanonical: Middleware = async (ctx: Context) => {
  const {clients: {canonicals}} = ctx
  const canonicalRoute: Route = await parseBody(ctx)
  await canonicals.save(canonicalRoute)
  ctx.status = 204
}
