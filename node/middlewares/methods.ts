const TEN_SECONDS_S = 10

export const methodNotAllowed: Middleware = async ctx => {
  ctx.status = 405
  ctx.set('cache-control', `max-age=${TEN_SECONDS_S}`)
}
