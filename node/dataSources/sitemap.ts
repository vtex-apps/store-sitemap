import { RequestOptions, RESTDataSource } from 'apollo-datasource-rest'

import { Context } from '../utils/helpers'

export class SiteMap extends RESTDataSource<Context> {
  get baseURL() {
    const {vtex: {account}} = this.context
    return `http://${account}.vtexcommercestable.com.br`
  }

  public fromLegacy = () => this.get(this.context.get('x-forwarded-path'))

  protected willSendRequest = (request: RequestOptions) => {
    request.headers.set('Proxy-Authorization', this.context.vtex.authToken)
  }
}
