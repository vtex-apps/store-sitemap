import {map} from 'ramda'

import colossus from './resources/colossus'
import {getRobotsTxt, getSiteMapXML} from './resources/site'

const errorResponse = (err) => {
  if (err.response) {
    const status = err.response.status
    const {url, method, data} = err.response.config
    const {error, operationId, responseStatus} = err.response.data
    return {status, body: error, details: {url, method, data, operationId, responseStatus}}
  }
  return {status: 500, body: err, details: {}}
}

const prepare = (middleware: (ctx: ColossusContext) => Promise<void>) => {
  return async (ctx) => {
    const {vtex: {account, workspace, authToken}} = ctx
    const logger = colossus(account, workspace, authToken)
    try {
      await middleware(ctx)
    } catch (err) {
      const errorMessage = `Error processing ${middleware.name}`
      ctx.set('cache-control', `no-cache`)

      const {status, details, body} = errorResponse(ctx)
      if (err.response) {
        ctx.status = status
        ctx.body = {error: {body, details}}
        logger.log(errorMessage, 'error', details)
        return
      }
      logger.log(errorMessage, 'error', {errorMessage: err.message})
      ctx.body = err
      ctx.status = status
    }
  }
}

const robots = async function robotsTxtMiddleware (ctx) {
  const forwardedHost = ctx.get('x-forwarded-host')
  const {data} = await getRobotsTxt(forwardedHost)

  ctx.set('Content-Type', 'text/plain')
  ctx.body = data
  ctx.status = 200
}

const sitemap = async function siteXMLMiddleware (ctx) {
  const {vtex: {account, authToken, route}} = ctx
  const path = ctx.headers['x-forwarded-path']
  const {data} = await getSiteMapXML(account, authToken, path)
  console.log('received sitemap:', data)
  const forwardedHost = ctx.get('x-forwarded-host')
  const body = data.replace(new RegExp(`${account}.vtexcommercestable.com.br`, 'g'), forwardedHost)

  ctx.set('Content-Type', 'text/xml')
  ctx.body = body
  ctx.status = 200
}

export default {
  routes: map(prepare, {
    brands: sitemap,
    departments: sitemap,
    products: sitemap,
    robots,
    sitemap,
  }),
}
