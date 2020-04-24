import { endsWith } from 'ramda'

const TEN_SECONDS_S = 10
const TEN_MINUTES_S = 10 * 60
const FIVE_MINUTES_S = 5 * 60
const TEN_SECONDS = 10

const publicEndpoint = `.${process.env.VTEX_PUBLIC_ENDPOINT ?? 'myvtex.com'}`

const isPrivateHost = (host: string) => endsWith(publicEndpoint, host)

const from0To30 = () => Math.round(Math.random() * 30)

export async function cache(ctx: Context, next: () => Promise<void>) {
  const {
    vtex: { production, logger },
    request: {
      headers: { 'x-forwarded-host': originalHost },
    },
  } = ctx

  try {
    await next()
  } catch (err) {
    logger.error(err)
    ctx.body =
      ctx.body || `Something exploded: operationId=${ctx.vtex.operationId}`
    ctx.status = 500
  } finally {
    const shouldCache = 200 <= ctx.status && ctx.status < 300 && production
    const maxAge = isPrivateHost(originalHost)
      ? TEN_SECONDS
      : TEN_MINUTES_S + from0To30()

    if (shouldCache) {
      ctx.set(
        'cache-control',
        `public, max-age=${maxAge}, stale-while-revalidate=${TEN_SECONDS_S}, stale-if-error=${TEN_MINUTES_S}`
      )
      ctx.set('x-vtex-etag-control', `public, max-age=${FIVE_MINUTES_S}`)
    } else {
      ctx.set('cache-control', 'no-store, no-cache')
    }
  }
}
