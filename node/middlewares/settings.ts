import { appIdToAppAtMajor } from '@vtex/api'
import { PRODUCT_ROUTES_INDEX, REWRITER_ROUTES_INDEX } from './generateMiddlewares/utils'

export interface Settings {
  enableProductRoutes: boolean
  enableRewriterRoutes: boolean
}

const VTEX_APP_ID = process.env.VTEX_APP_ID!
const VTEX_APP_AT_MAJOR = appIdToAppAtMajor(VTEX_APP_ID)

const DEFAULT_SETTINGS = {
  enableProductRoutes: true,
  enableRewriterRoutes: true,
}

const INDEX_MAP = {
  enableProductRoutes: PRODUCT_ROUTES_INDEX,
  enableRewriterRoutes: REWRITER_ROUTES_INDEX,
}

export async function settings(ctx: Context | EventContext, next: () => Promise<void>) {
  const {
    clients: { apps },
  } = ctx

  const appSettings: Settings = {
    ...DEFAULT_SETTINGS,
    ...(await apps.getAppSettings(VTEX_APP_AT_MAJOR)),
  }
  const keys = Object.keys(appSettings) as Array<keyof Settings>
  const enabledIndexFiles = keys.reduce(
     (acc, key ) => {
       if (appSettings[key]) {
         acc.push(INDEX_MAP[key])
       }
       return acc
     }, [] as string[])

  ctx.state = {
    ...ctx.state,
    enabledIndexFiles,
    settings: appSettings,
  }


  await next()
}
