import {HttpClient, InstanceOptions, IOContext} from '@vtex/api'
import { UserRouteInfo } from 'v1typings'

export default class Routes {
  private http: HttpClient

  constructor (ioContext: IOContext, opts: InstanceOptions) {
    this.http = HttpClient.forWorkspace('colossus', ioContext, opts)
  }

  public getUserRoutes = (): Promise<UserRouteInfo> => {
    return this.http.get<UserRouteInfo>(`/_routes/user?__v=${process.env.VTEX_APP_VERSION}`)
  }
}
