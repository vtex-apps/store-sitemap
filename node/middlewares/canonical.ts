import { json as parseBody } from 'co-body'

import { isSearch, precedence, removeQuerystring, Route } from '../resources/route'

export const getCanonical: Middleware = async (ctx: Context) => {
  const {clients: {canonicals}, query: {canonicalPath}} = ctx
  const path = removeQuerystring(canonicalPath)
  const maybeRoute = await canonicals.load(path)
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
