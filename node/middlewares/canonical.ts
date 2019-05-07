import { json as parseBody } from 'co-body'

import { precedence, Route } from '../resources/route'

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
  const newRoute: Route = await parseBody(ctx)
  const {canonical: canonicalPath} = newRoute
  const savedRoute = await canonicals.load(canonicalPath)

  if (!savedRoute || precedence(newRoute, savedRoute)) {
    await canonicals.save(newRoute)
  }

  ctx.status = 204
}
