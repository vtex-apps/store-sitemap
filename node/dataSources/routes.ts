import { forWorkspace, IODataSource } from '@vtex/api'

interface UserRouteItem {
  handler: string,
  headers: {[index: string]: string},
  path: string,
  public: boolean
}

interface UserRoute {
  [routeId: string]: UserRouteItem
}

interface UserRoutes {
  [app: string]: UserRoute
}

export class Routes extends IODataSource {
  protected httpClientFactory = forWorkspace
  protected service = 'colossus'

  public userRoutes = () => this.http.get<UserRoutes>(`/_routes/user?__v=${process.env.VTEX_APP_VERSION}`)
}
