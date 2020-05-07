import { parse } from 'query-string'

import { BindingResolver } from '../resources/bindings'
import { CONFIG_BUCKET, CONFIG_FILE, getMatchingBindings, hashString } from '../utils'
import { GENERATE_SITEMAP_EVENT } from './generateSitemap'

// const ONE_DAY_S = 24 * 60 * 60
const TWO_HOURS = 2 * 60 * 60
export async function prepare(ctx: Context, next: () => Promise<void>) {
  const {
    vtex: { production },
    clients: { vbase, events, tenant },
  } = ctx
  const forwardedHost = ctx.get('x-forwarded-host')
  let rootPath = ctx.get('x-vtex-root-path')
  // Defend against malformed root path. It should always start with `/`.
  if (rootPath && !rootPath.startsWith('/')) {
    rootPath = `/${rootPath}`
  }
  const [forwardedPath, queryString] = ctx.get('x-forwarded-path').split('?')
  const matchingBindings = await getMatchingBindings(forwardedHost, tenant)
  const bindingResolver = new BindingResolver()
  const binding = await bindingResolver.discover(ctx)
  if (!binding) {
    throw new Error(`Binding from context not found`)
  }

  const query = parse(queryString)

  const { productionPrefix } = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE)
    .catch(err => {
      events.sendEvent('', GENERATE_SITEMAP_EVENT)
      throw err
    })
  const bucket = `${productionPrefix}_${hashString(binding.id)}`

  ctx.state = {
    ...ctx.state,
    binding,
    bindingAddress: query.__bindingAddress as string | undefined,
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
    production ? `public, max-age=${TWO_HOURS}` : 'no-cache'
  )
  if (production) {
    events.sendEvent('', GENERATE_SITEMAP_EVENT)
  }
}
