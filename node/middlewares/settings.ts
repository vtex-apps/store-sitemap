import { appIdToAppAtMajor } from '@vtex/api'
import {
  APPS_ROUTES_INDEX,
  PRODUCT_ROUTES_INDEX,
  REWRITER_ROUTES_INDEX,
} from './generateMiddlewares/utils'

export interface Settings {
  enableAppsRoutes: boolean
  enableProductRoutes: boolean
  enableNavigationRoutes: boolean
  enableCmsRoutes: boolean
  enableContentPlatformRoutes: boolean
  /**
   * Headless CMS (legacy) project id used as `{projectId}` in the CMS builder
   * REST path (`/_v/cms/api/{projectId}/...`). Defaults to `faststore`, which
   * matches stores that did not customize the CMS builder. Only consumed when
   * `enableCmsRoutes` is on. Optional: the settings middleware always fills it
   * from `DEFAULT_SETTINGS`, and readers fall back to `faststore`.
   */
  hcmsProjectId?: string
  /**
   * Allowlist of Headless CMS content types ingested into the sitemap. Each
   * type is paginated via the CMS builder API and its pages are emitted using
   * `settings.seo.slug`. Defaults to `["landingPage"]`; add the ids of any
   * other routable content types the store created. Only consumed when
   * `enableCmsRoutes` is on. Optional: the settings middleware always fills it
   * from `DEFAULT_SETTINGS`, and readers fall back to the default list.
   */
  hcmsContentTypes?: string[]
  /**
   * FastStore project id used as `{storeId}` in the Content Platform Data
   * Plane path. Defaults to `faststore` — matches stores that did not
   * customize `contentSource.project`.
   */
  contentPlatformStoreId: string
  /**
   * Allowlist of routable content types ingested by the Content Platform
   * source. Defaults to the predefined FastStore types. Custom types only
   * need to be added here once.
   */
  contentPlatformContentTypes: string[]
  ignoreBindings: boolean
  disableRoutesTerm: string
}

const VTEX_APP_ID = process.env.VTEX_APP_ID!
const VTEX_APP_AT_MAJOR = appIdToAppAtMajor(VTEX_APP_ID)

export const DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES: string[] = [
  'landingPage',
  'home',
]

export const DEFAULT_CONTENT_PLATFORM_STORE_ID = 'faststore'

export const DEFAULT_HCMS_CONTENT_TYPES: string[] = ['landingPage']

export const DEFAULT_HCMS_PROJECT_ID = 'faststore'

const DEFAULT_SETTINGS: Settings = {
  contentPlatformContentTypes: DEFAULT_CONTENT_PLATFORM_CONTENT_TYPES,
  contentPlatformStoreId: DEFAULT_CONTENT_PLATFORM_STORE_ID,
  disableRoutesTerm: '',
  enableAppsRoutes: true,
  enableCmsRoutes: false,
  enableContentPlatformRoutes: false,
  enableNavigationRoutes: true,
  enableProductRoutes: true,
  hcmsContentTypes: DEFAULT_HCMS_CONTENT_TYPES,
  hcmsProjectId: DEFAULT_HCMS_PROJECT_ID,
  ignoreBindings: false,
}

// CMS / Content Platform routes use dedicated per-binding buckets (spec
// Decision 1 / Decision 7) and are composed into /sitemap.xml via dedicated
// reads in sitemap.ts — not via enabledIndexFiles / the shared production
// bucket.
const INDEX_MAP: Record<keyof Settings, string> = {
  contentPlatformContentTypes: '',
  contentPlatformStoreId: '',
  disableRoutesTerm: '',
  enableAppsRoutes: APPS_ROUTES_INDEX,
  enableCmsRoutes: '',
  enableContentPlatformRoutes: '',
  enableNavigationRoutes: REWRITER_ROUTES_INDEX,
  enableProductRoutes: PRODUCT_ROUTES_INDEX,
  hcmsContentTypes: '',
  hcmsProjectId: '',
  ignoreBindings: '',
}

export async function settings(
  ctx: Context | EventContext,
  next: () => Promise<void>
) {
  const {
    clients: { apps },
  } = ctx

  const appSettings: Settings = {
    ...DEFAULT_SETTINGS,
    ...(await apps.getAppSettings(VTEX_APP_AT_MAJOR)),
  }
  const keys = Object.keys(appSettings) as Array<keyof Settings>
  const enabledIndexFiles = keys.reduce((acc, key) => {
    if (appSettings[key] && INDEX_MAP[key]) {
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
