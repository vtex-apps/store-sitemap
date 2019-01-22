import 'bluebird-global'

import { hrToMillis, MetricsAccumulator } from '@vtex/api'
import { map } from 'ramda'

import { dataSources, initialize } from './dataSources'
import { canonical } from './middlewares/canonical'
import { customSitemap } from './middlewares/customSitemap'
import { robots } from './middlewares/robots'
import { sitemap } from './middlewares/sitemap'
import { userSitemap } from './middlewares/userSitemap'
import { Context, Middleware } from './utils/helpers'

(global as any).metrics = new MetricsAccumulator()

Promise.config({
  longStackTraces: false,
  warnings: true,
})

const TEN_MINUTES_S = 10 * 60
const TEN_SECONDS_S = 10
const TEN_SECONDS_MS = 10 * 1000

const statusLabel = (status: number) =>
  `${Math.floor(status/100)}xx`

const log = (
  {vtex: {account, workspace, route: {id}}, url, method, status}: Context,
  millis: number
) =>
  `${new Date().toISOString()}\t${account}/${workspace}:${id}\t${status}\t${method}\t${url}\t${millis}ms`

const prepare = (middleware: Middleware) => async (ctx: Context) => {
  const {vtex: {production, route: {id}}} = ctx
  const start = process.hrtime()

  ctx.dataSources = dataSources()
  initialize(ctx)

  try {
    await middleware(ctx)
  } catch (err) {
    console.error(err)
    ctx.status = 500
    ctx.set('cache-control', `public, max-age=${TEN_SECONDS_S}`)
    ctx.dataSources.logger.error(err, {handler: id})
    ctx.body = err.message
  } finally {
    const end = process.hrtime(start)
    console.log(log(ctx, hrToMillis(end)))
    metrics.batchHrTimeMetricFromEnd(`${id}-http-${statusLabel(ctx.status)}`, end, production)
  }
}

export default {
  routes: map(prepare, {
    brands: sitemap,
    category: sitemap,
    custom: customSitemap,
    departments: sitemap,
    products: sitemap,
    robots,
    sitemap,
    user: userSitemap,
  }),
  statusTrack: metrics.statusTrack,
}
