import { ExternalClient, InstanceOptions, IOContext } from '@vtex/api'

export class Robots extends ExternalClient {
  constructor (context: IOContext, options?: InstanceOptions) {
    super('http://janus-edge.vtex.com.br', context, options)
  }

  public fromLegacy = (account: string) => this.http.get<string>(`/robots.txt?an=${account}`)
}
