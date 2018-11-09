import {HttpClient, Logger} from '@vtex/api'
import {map} from 'ramda'

import {robots} from './middlewares/robots'
import {sitemap} from './middlewares/sitemap'

const TEN_MINUTES_S = 10 * 60
const TEN_SECONDS_S = 10
const TEN_SECONDS_MS = 10 * 1000

const prepare = (middleware: Middleware) => async (ctx: ServiceContext) => {
  const {vtex: {production, route: {id}}} = ctx
  ctx.logger = new Logger(ctx.vtex, {timeout: 3000})
  ctx.renderClient = HttpClient.forWorkspace('render-server.vtex', ctx.vtex, {timeout: TEN_SECONDS_MS})

  try {
    await middleware(ctx)
    ctx.status = 200
    ctx.set('cache-control', production ? `public, max-age=${TEN_MINUTES_S}`: 'no-cache')
  } catch (err) {
    console.error(err)
    ctx.status = 500
    ctx.set('cache-control', `public, max-age=${TEN_SECONDS_S}`)
    ctx.logger.error(err, {handler: id})
    ctx.body = err.message
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
