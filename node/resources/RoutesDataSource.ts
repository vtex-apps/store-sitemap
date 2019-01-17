import {forWorkspace, IODataSource} from '@vtex/api'

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

export class RoutesDataSource extends IODataSource {
  protected httpClientFactory = forWorkspace
  protected service = 'colossus'

  public getUserRoutes = (): Promise<UserRouteInfo> => {
    return this.http.get<UserRouteInfo>(`/_routes/user?__v=${process.env.VTEX_APP_VERSION}`)
  }
}
