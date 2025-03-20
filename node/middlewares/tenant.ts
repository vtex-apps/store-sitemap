import { TENANT_CACHE_TTL_S } from '../utils'

export async function tenant(ctx: EventContext, next: () => Promise<void>) {
  const {
    clients: { tenant: tenantClient },
  } = ctx
  const tenantInfo = await tenantClient.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })

  const locale = tenantInfo.defaultLocale

  ctx.vtex.locale = locale
  ctx.vtex.tenant = { locale }

  await next()
}
