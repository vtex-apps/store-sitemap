import { BindingResolver } from '../resources/bindings'
import { getStoreBindings, hashString } from '../utils'
import { GENERATE_SITEMAP_EVENT, SITEMAP_BUCKET } from './generateSitemap'

const ONE_DAY_S = 24 * 60 * 60
export async function prepare(ctx: Context, next: () => Promise<void>) {
  const {
    vtex: { production },
    clients: { events, tenant },
  } = ctx
  const forwardedHost = ctx.get('x-forwarded-host')
  // TODO :  check rootPath, maybe remove
  let rootPath = ctx.get('x-vtex-root-path')
  // Defend against malformed root path. It should always start with `/`.
  if (rootPath && !rootPath.startsWith('/')) {
    rootPath = `/${rootPath}`
  }
  const [forwardedPath] = ctx.get('x-forwarded-path').split('?')
  // TODO: GET Bindings that match the forwarded-path without workspace?
  const matchingBindings = await getStoreBindings(tenant)
  const hasMultipleMatchingBindings = matchingBindings.length > 1
  const bindingResolver = new BindingResolver()

  const bucket = hasMultipleMatchingBindings
    ? `${hashString((await bindingResolver.discoverId(ctx)) as string)}`
    : SITEMAP_BUCKET

  ctx.state = {
    ...ctx.state,
    bucket,
    forwardedHost,
    forwardedPath,
    hasMultipleMatchingBindings,
    matchingBindings,
    rootPath,
  }

  await next()

  ctx.set('Content-Type', 'text/xml')
  ctx.status = 200
  ctx.set(
    'cache-control',
    production ? `public, max-age=${ONE_DAY_S}` : 'no-cache'
  )
  if (production) {
    events.sendEvent('', GENERATE_SITEMAP_EVENT)
  }
}
