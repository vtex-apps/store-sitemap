import { HttpClient, Logger, ServiceContext as ColossusServiceContext } from '@vtex/api'
import { Context } from 'koa'

declare global {
  type LogLevel = 'info' | 'error' | 'warning' | 'debug'

  type Middleware = (ctx: ServiceContext) => Promise<void>

  interface ServiceContext extends ColossusServiceContext {
    logger: Logger
    renderClient: HttpClient
  }
}

export {}
