declare module 'v1typings' {
  interface UserRouteItem {
    handler: string,
    headers: {[index: string]: string},
    path: string,
    public: boolean
  }

  interface UserRoute {
    [routeId: string]: UserRouteItem
  }

  interface UserRouteInfo {
    [app: string]: UserRoute
  }
}
