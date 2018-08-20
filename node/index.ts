import {map} from 'ramda'
import colossus from './resources/colossus'

import {robots} from './middlewares/robots'
import {sitemap} from './middlewares/sitemap'

const errorResponse = (err) => {
  if (err.response) {
    const status = err.response.status
    const {url = null, method = null, data = null} = err.response.config || {}
    const {error = null, operationId = null, responseStatus = null} = err.response.data || {}
    return {status, body: error, details: {url, method, data, operationId, responseStatus}}
  }
  return {status: 500, body: err, details: {}}
}

const prepare = (middleware: Middleware) => async (ctx: ColossusContext) => {
  const {vtex: {account, workspace, authToken, route: {id}}} = ctx
  ctx.colossusLogger =   colossus(account, workspace, authToken)
  try {
    await middleware(ctx)
  } catch (err) {
    console.error(err)

    const errorMessage = `Error processing route ${id}`
    ctx.set('cache-control', `no-cache`)

    const {status, details, body} = errorResponse(ctx)
    if (err.response) {
      ctx.status = status
      ctx.body = {error: {body, details}}
      ctx.colossusLogger.log(errorMessage, 'error', details)
      return
    }
    ctx.colossusLogger.log(errorMessage, 'error', {errorMessage: err.message})
    ctx.body = err
    ctx.status = status
  }
}

export default {
  routes: map(prepare, {
    brands: sitemap,
    category: sitemap,
    departments: sitemap,
    products: sitemap,
    robots,
    sitemap,
  }),
}
