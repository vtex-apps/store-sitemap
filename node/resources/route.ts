import { compose, equals, head, identity, last, split } from 'ramda'

import RouteParser = require('route-parser')

export const routeIdToStoreRoute: any = {
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

const removeHost = (fullPath: string, host: string) =>
  fullPath.substring(fullPath.indexOf(host) + host.length)

export const isCanonical = (ctx: Context) =>
  routeIdToStoreRoute[ctx.vtex.route.id] != null

export const isValid = (route: Route) =>
  route.id && route.path && route.canonical && route.pathId

const lastSegment = (path: string | undefined) => path && last(split('/', path))

export const isSearch = ({ path }: { path?: string }) =>
  lastSegment(path) === 's'

/**
 * Returns true if route r1 takes precedence over route r2
 * Precedence rules can be found in `https://help.vtex.com/tutorial/como-funciona-a-busca-da-vtex/`
 */
export const precedence = (r1: Route, r2: Route) => {
  const deepEquals = equals(r1, r2)
  const lastSegmentR1 = lastSegment(r1.path)
  const lastSegmentR2 = lastSegment(r2.path)

  if (deepEquals) {
    return false
  }
  if (lastSegmentR1 === lastSegmentR2) {
    return true
  }
  if (lastSegmentR1 === 'b') {
    return true
  }
  if (lastSegmentR2 === 'b') {
    return false
  }
  if (lastSegmentR1 === 'd') {
    return true
  }
  if (lastSegmentR2 === 'd') {
    return false
  }
  return true
}

export const removeQuerystring = (path: string) =>
  compose<string, string[], string>(head, split('?'))(path)

export class Route {
  public static from = (route: Route): Route => ({
    ...route,
    canonical: removeQuerystring(route.canonical),
    path: removeQuerystring(route.path),
  })

  public params?: Record<string, string>
  public id: string
  public path: string
  public canonical: string
  public pathId: string

  constructor(ctx: Context, canonicalPath: string) {
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
