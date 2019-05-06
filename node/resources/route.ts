import { identity, last, split } from 'ramda'
import RouteParser = require('route-parser')

const routeIdToStoreRoute: any = {
  brands: {
    id: 'store.search#brand',
    originalSitemapPathToSystem: (path: string) => `${path}/b`,
    pathId: '/:p1/b',
  },
  departments: {
    id: 'store.search#department',
    originalSitemapPathToSystem: (path: string) => `${path}/d`,
    pathId: '/:p1/d',
  },
}

const removeHost = (fullPath: string, host: string) => fullPath.substring(fullPath.indexOf(host) + host.length)

export const isCanonical = (ctx: Context) => routeIdToStoreRoute[ctx.vtex.route.id] != null

export const isValid = (route: Route) => route.id && route.path && route.canonical && route.pathId

/**
 * Returns true if route r1 takes precedence over route r2
 * Precedence rules can be found in `https://help.vtex.com/tutorial/como-funciona-a-busca-da-vtex/`
 */
export const precedence = (r1: Route, r2: Route) => {
  const lastSegmentR1 = last(split('/', r1.path))
  const lastSegmentR2 = last(split('/', r2.path))

  if (lastSegmentR1 === lastSegmentR2) {
    return true
  } else if(lastSegmentR1 === 'b') {
    return true
  } else if(lastSegmentR2 === 'b') {
    return false
  } else if(lastSegmentR1 === 'd') {
    return true
  } else if(lastSegmentR2 === 'd') {
    return false
  }
  return true
}

export class Route {
  public params?: Record<string, string>
  public id: string
  public path: string
  public canonical: string
  public pathId: string

  constructor(
    ctx: Context,
    canonicalPath: string
  ) {
    const forwardedHost = ctx.get('x-forwarded-host')
    const route = {
      originalSitemapPathToCanonical: identity,
      originalSitemapPathToSystem: identity,
      ...routeIdToStoreRoute[ctx.vtex.route.id],
    }

    const pathNoHost = removeHost(canonicalPath, forwardedHost)

    this.id = route.id
    this.path = route.originalSitemapPathToSystem(pathNoHost)
    this.canonical = route.originalSitemapPathToCanonical(pathNoHost)
    this.pathId = route.pathId

    const parsedParams = new RouteParser(route.pathId).match(this.path)
    if (parsedParams) {
      this.params = parsedParams
    }
  }
}
