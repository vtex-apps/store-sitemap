import { IOClients, Sphinx, VBase } from '@vtex/api'

import { Catalog } from './catalog'
import { GraphQLServer } from './graphqlServer'
import { VtexID } from './id'
import { Messages } from './messages'
import { Rewriter } from './rewriter'
import { Robots } from './robots'
import { RobotsGC } from './robotsGC'
import { CVBase } from './vbase'

export class Clients extends IOClients {
  public get vbase() {
    return this.getOrSet('vbase', CVBase)
  }

  public get vbaseWithCache() {
    return this.getOrSet('vbaseWithCache', VBase)
  }

  public get robots() {
    return this.getOrSet('robots', Robots)
  }

  public get robotsGC() {
    return this.getOrSet('robotsGC', RobotsGC)
  }

  public get rewriter() {
    return this.getOrSet('rewriter', Rewriter)
  }

  public get catalog() {
    return this.getOrSet('catalog', Catalog)
  }

  public get messages() {
    return this.getOrSet('messages', Messages)
  }

  public get graphqlServer(): GraphQLServer {
    return this.getOrSet('graphqlServer', GraphQLServer)
  }

  public get vtexID() {
    return this.getOrSet('vtexID', VtexID)
  }

  public get sphinx() {
    return this.getOrSet('sphinx', Sphinx)
  }
}
