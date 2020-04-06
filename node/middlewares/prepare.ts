import { BindingResolver } from '../resources/bindings'
import { getMatchingBindings, hashString } from '../utils'
import { GENERATE_SITEMAP_EVENT } from './generateSitemap'

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
  const matchingBindings = await getMatchingBindings(forwardedHost, tenant)
  const bindingResolver = new BindingResolver()

  const bucket = `${hashString(
    (await bindingResolver.discoverId(ctx)) as string
  )}`

  ctx.state = {
    ...ctx.state,
    bucket,
    forwardedHost,
    forwardedPath,
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
