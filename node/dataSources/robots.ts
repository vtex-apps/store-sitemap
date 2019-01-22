import { RequestOptions, RESTDataSource } from 'apollo-datasource-rest'

import { Context } from '../utils/helpers'

export class Robots extends RESTDataSource<Context> {
  public baseURL = `http://janus-edge.vtex.com.br`

  public fromLegacy = () => this.get(`/robots.txt?an=${this.context.vtex.account}`)

  protected willSendRequest = (request: RequestOptions) => {
    request.headers.set('Proxy-Authorization', this.context.vtex.authToken)
  }
}
