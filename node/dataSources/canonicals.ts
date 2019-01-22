import { VBase } from '@vtex/api'

import { Route } from '../resources/route'
import { Maybe } from '../utils/helpers'

export class Canonicals extends VBase {
  private BUCKET = 'canonicals'

  public save = (entry: Route) => this.saveJSON<Route>(this.BUCKET, this.canonicalToVBase(entry.canonical), entry)

  public load = (canonicalPath: string) => this.getJSON<Maybe<Route>>(this.BUCKET, this.canonicalToVBase(canonicalPath), true)

  private canonicalToVBase = (canonicalPath: string) => `${canonicalPath.replace(/\W/g, '_')}.json`
}
