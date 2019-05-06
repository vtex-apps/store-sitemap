import { JanusClient } from '@vtex/api'

export class SiteMap extends JanusClient {
  public fromLegacy = (forwardedPath: string) => this.http.get(forwardedPath)
}
