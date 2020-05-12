import { AppClient, InstanceOptions, IOContext } from '@vtex/api'


export class Meta extends AppClient {
  constructor(ctx: IOContext, opts?: InstanceOptions) {
    super('vtex.store-sitemap@2.x', ctx, opts)
  }

  public makeMetaRequest = () => this.http.get('/meta')
}
