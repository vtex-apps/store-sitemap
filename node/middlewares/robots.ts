import { Context } from '../utils/helpers'

const TEN_MINUTES_S = 10 * 60

export const robots = async (ctx: Context) => {
  const {vtex: {production}} = ctx
  const {dataSources: {robots: robotsDataSource}} = ctx
  const {data} = await robotsDataSource.fromLegacy()
  ctx.set('Content-Type', 'text/plain')
  ctx.body = data
}
