const TEN_MINUTES_S = 10 * 60

export async function robots (ctx: Context) {
  const {vtex: {account, production, platform}} = ctx
  const { clients } = ctx
  const robotsDataSource = platform === 'gocommerce' ? clients.robotsGC : clients.robots
  const data = await robotsDataSource.fromLegacy(account)
  ctx.set('Content-Type', 'text/plain')
  ctx.body = data
  ctx.status = 200
  ctx.set('cache-control', production ? `public, max-age=${TEN_MINUTES_S}`: 'no-cache')
}
