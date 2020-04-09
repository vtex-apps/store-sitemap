import { IOClients } from '@vtex/api'

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
}
