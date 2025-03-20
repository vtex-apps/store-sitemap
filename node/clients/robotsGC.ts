import { AppClient, InstanceOptions, IOContext } from '@vtex/api'

export class RobotsGC extends AppClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(`gocommerce.sitemap-app`, context, options)
  }

  public fromLegacy = (account: string) =>
    this.http.get<string>(`/robots.txt?an=${account}`)
}
