import * as RouteParser from 'route-parser'

const identity = (x) => x

const routeIdToStoreRoute = {
  brands: {
    id: 'store/brand',
    originalSitemapPathToSystem: (path: string) => `${path}/b`,
    path: '/:brand/b',
  },
  departments: {
    id: 'store/department',
    originalSitemapPathToSystem: (path: string) => `${path}/d`,
    path: '/:department/d',
  }
}

const removeHost = (fullPath: string, host: string) => fullPath.substring(fullPath.indexOf(host) + host.length)

export const isCanonical = (ctx: ColossusContext) => routeIdToStoreRoute[ctx.vtex.route.id] != null

export class Route {
  public params: Record<string, any>
  public id: string
  public path: string
  public canonical?: string

  constructor(
    ctx: ColossusContext,
    path: string,
  ) {
    const forwardedHost = ctx.get('x-forwarded-host')
    const route = {
      originalSitemapPathToCanonical: identity,
      originalSitemapPathToSystem: identity,
      ...routeIdToStoreRoute[ctx.vtex.route.id],
    }

    const pathNoHost = removeHost(path, forwardedHost)

    this.id = route.id
    this.path = route.originalSitemapPathToSystem(pathNoHost)
    this.canonical = route.originalSitemapPathToCanonical(pathNoHost)

    const parsedParams = new RouteParser(route.path).match(this.path)
    if (parsedParams) {
      this.params = parsedParams
    }
  }
}
