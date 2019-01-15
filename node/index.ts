import {Apps, hrToMillis, HttpClient, Logger, MetricsAccumulator} from '@vtex/api'

import {map} from 'ramda'

import {robots} from './middlewares/robots'
import {sitemap} from './middlewares/sitemap'
import {colossusSitemap} from './middlewares/colossusSitemap'
import {customSitemap} from './middlewares/customSitemap'

(global as any).metrics = new MetricsAccumulator()

const TEN_MINUTES_S = 10 * 60
const TEN_SECONDS_S = 10
const TEN_SECONDS_MS = 10 * 1000

const statusLabel = (status: number) =>
  `${Math.floor(status/100)}xx`

const log = (
  {vtex: {account, workspace, route: {id}}, url, method, status}: Context,
  millis: number,
) =>
  `${new Date().toISOString()}\t${account}/${workspace}:${id}\t${status}\t${method}\t${url}\t${millis}ms`

const prepare = (middleware: Middleware) => async (ctx: Context) => {
  const {vtex: {production, route: {id}}} = ctx
  const start = process.hrtime()
  ctx.logger = new Logger(ctx.vtex, {timeout: 3000})
  ctx.apps = new Apps(ctx.vtex, {timeout: 3000})
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
    departments: sitemap,
    products: sitemap,
    custom: customSitemap,
    colossus: colossusSitemap,
    robots,
    sitemap,
  }),
  statusTrack: metrics.statusTrack,
}
