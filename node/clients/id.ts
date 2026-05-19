import { ExternalClient, InstanceOptions, IOContext } from '@vtex/api'

const userAgent = process.env.VTEX_APP_ID!

export interface CredentialValidateResponse {
  user: string
  account: string
}

export class VtexID extends ExternalClient {
  public constructor(context: IOContext, options?: InstanceOptions) {
    super(
      `http://${context.account}.vtexcommercestable.com.br/api/vtexid`,
      context,
      options
    )
  }

  public validateCredential = (token: string): Promise<CredentialValidateResponse> =>
    this.http.post(
      `credential/validate?an=${this.context.account}`,
      { token },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
          'X-VTEX-Proxy-To': `https://${this.context.account}.vtexcommercestable.com.br`,
        },
        metric: 'vtexid-authtoken',
      }
    )
}
