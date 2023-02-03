import { parse } from 'query-string'

import { BindingResolver } from '../resources/bindings'
import { CONFIG_BUCKET, CONFIG_FILE, getBucket, getMatchingBindings, hashString, startSitemapGeneration } from '../utils'
import { DEFAULT_CONFIG } from './generateMiddlewares/utils'

const ONE_DAY_S = 24 * 60 * 60
const FORWARDED_HOST_HEADER = 'x-forwarded-host'
const VTEX_ROOT_PATH_HEADER = 'x-vtex-root-path'

export async function prepare(ctx: Context, next: () => Promise<void>) {
  const {
    vtex: { production },
    clients: { vbase, tenant },
  } = ctx
  const forwardedHost = ctx.get('x-forwarded-host')
  let rootPath = ctx.get('x-vtex-root-path')
  // Defend against malformed root path. It should always start with `/`.
  if (rootPath && !rootPath.startsWith('/')) {
    rootPath = `/${rootPath}`
  }
  if (rootPath === '/') {
    rootPath = ''
  }
  const [forwardedPath, queryString] = ctx.get('x-forwarded-path').split('?')
  const matchingBindings = await getMatchingBindings(forwardedHost, tenant)
  const bindingResolver = new BindingResolver()
  const binding = await bindingResolver.discover(ctx)
  if (!binding) {
    throw new Error(`Binding from context not found`)
  }

  const query = parse(queryString)

  const { productionPrefix } = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG

  const bucket = getBucket(productionPrefix, hashString(binding.id))

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
    production ? `public, max-age=${ONE_DAY_S}` : 'no-cache'
  )
  if (production) {
    startSitemapGeneration(ctx)
  }
  ctx.vary(FORWARDED_HOST_HEADER)
  ctx.vary(VTEX_ROOT_PATH_HEADER)

  return
}
