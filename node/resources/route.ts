import { identity } from 'ramda'
import * as RouteParser from 'route-parser'

import { Context } from '../utils/helpers'

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
