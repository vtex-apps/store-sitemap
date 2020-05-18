import { IOClients } from '@vtex/api'

import { Catalog } from './catalog'
import { Messages } from './messages'
import { Meta } from './meta'
import { Rewriter } from './rewriter'
import { Robots } from './robots'
import { RobotsGC } from './robotsGC'

export class Clients extends IOClients {
  public get robots() {
    return this.getOrSet('robots', Robots)
  }

  public get robotsGC() {
    return this.getOrSet('robotsGC', RobotsGC)
  }

  public get rewriter() {
    return this.getOrSet('rewriter', Rewriter)
  }

  public get meta() {
    return this.getOrSet('meta', Meta)
  }

  get catalog() {
    return this.getOrSet('catalog', Catalog)
  }

  get messages() {
    return this.getOrSet('messages', Messages)
  }
}
