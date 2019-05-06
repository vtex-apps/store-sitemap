import { InfraClient, InstanceOptions, IOContext } from '@vtex/api'

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

export class Routes extends InfraClient {
  constructor (context: IOContext, options?: InstanceOptions) {
    super('colossus', context, options)
  }

  public userRoutes = () => this.http.get<UserRoutes>(`/_routes/user?__v=${process.env.VTEX_APP_VERSION}`)
}
