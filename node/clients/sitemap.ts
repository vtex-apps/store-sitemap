import { JanusClient } from '@vtex/api'

export default class SiteMap extends JanusClient {
  public fromLegacy = (forwardedPath: string) => this.http.get(forwardedPath)
}
