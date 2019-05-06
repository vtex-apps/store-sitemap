import { VBase } from '@vtex/api'

import { isValid, Route } from '../resources/route'

export class Canonicals extends VBase {
  private BUCKET = 'canonicals'

  public save = (entry: Route) => {
    if (!isValid(entry)) {
      throw new Error(`Missing required fields in ${JSON.stringify(entry)}, cannot save canonical route`)
    }
    return this.saveJSON<Route>(this.BUCKET, this.canonicalToVBase(entry.canonical), entry)
  }

  public load = (canonicalPath: string) => {
    if (!canonicalPath) {
      throw new Error('Cannot get canonical route from empty string')
    }
    return this.getJSON<Maybe<Route>>(this.BUCKET, this.canonicalToVBase(canonicalPath), true)
  }

  private canonicalToVBase = (canonicalPath: string) => `${canonicalPath.replace(/\W/g, '_')}.json`
}
