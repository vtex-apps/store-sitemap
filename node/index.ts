import 'bluebird-global'

import './globals'

import { hrToMillis, Service } from '@vtex/api'
import { map } from 'ramda'

import { clients } from './clients'
import { canonical } from './middlewares/canonical'
import { customSitemap } from './middlewares/customSitemap'
import { robots } from './middlewares/robots'
import { sitemap } from './middlewares/sitemap'
import { userSitemap } from './middlewares/userSitemap'
import { Middleware } from './utils/helpers'

Promise.config({
  longStackTraces: false,
  warnings: true,
})

const TEN_SECONDS_S = 10

const statusLabel = (status: number) =>
  `${Math.floor(status/100)}xx`

const log = (
  {vtex: {account, workspace, route: {id}}, url, method, status}: Context,
  millis: number
) =>
  `${new Date().toISOString()}\t${account}/${workspace}:${id}\t${status}\t${method}\t${url}\t${millis}ms`

const prepare = (middleware: Middleware) => async (ctx: Context) => {
  const {vtex: {route: {id}}} = ctx
  const start = process.hrtime()

  try {
    await middleware(ctx)
  } catch (err) {
    console.error(err)
    ctx.status = 500
    ctx.set('cache-control', `public, max-age=${TEN_SECONDS_S}`)
    ctx.clients.logger.error({...err, details: {handler: id}})
    ctx.body = err.message
  } finally {
    const end = process.hrtime(start)
    console.log(log(ctx, hrToMillis(end)))
    metrics.batch(`${id}-http-${statusLabel(ctx.status)}`, end)
  }
}

export default new Service ({
  clients,
  routes: map(prepare, {
    brands: sitemap,
    canonical,
    category: sitemap,
    custom: customSitemap,
    departments: sitemap,
    products: sitemap,
    robots,
    sitemap,
    user: userSitemap,
  }),
})
