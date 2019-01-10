import { HttpClient, Logger, MetricsAccumulator, ServiceContext } from '@vtex/api'

declare global {
  const metrics: MetricsAccumulator

  type Middleware = (ctx: Context) => Promise<void>

  interface Context extends ServiceContext {
    logger: Logger
    renderClient: HttpClient
  }
}

export {}
