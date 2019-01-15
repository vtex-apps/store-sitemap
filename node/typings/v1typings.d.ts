declare module 'v1typings' {
  import {AppsSettings} from '@vtex/api'
  import {Context} from 'koa'
  import {Dictionary} from 'ramda'

  import Resources from '../v1/resources'

  interface ColossusContext extends Context {
    vtex: IOContext
    resources: Resources
  }

  interface PagesContext extends ColossusContext {
    resources: Resources
    timings: Timings
  }

  interface IOContext {
    account: string
    workspace: string
    production: boolean
    authToken: string
    userAgent: string
    recorder?: any
    region: string
    route: {
      id: string
      declarer: string
      params: {
        [param: string]: string
      }
    }
  }

  interface Culture {
    availableLocales: string[]
    locale: string
    language: string
    country: string
    currency: string
  }

  interface AppsInfo {
    [app: string]: AppsInfoValue
  }

  interface AppsInfoValue extends Partial<PageInfo> {
    app?: string,
    build?: ReactBuildFile,
    externals?: ExternalAssetsByEnv,
    settings?: any,
    hashToCacheHints?: HashToCacheHints
  }

  interface HashToCacheHints {
    [hash: string]: CacheHints
  }

  interface PagesMeta {
    dependencies: FlatDependencies
    appsSettings: AppsSettings
  }

  interface AppFile {data: any; headers: any}

  interface Asset {
    path: string
    sourceMap?: string
    serverOnly?: boolean
  }

  interface AssetsByEnv {
    dev: Asset[]
    prod: Asset[]
  }

  interface Locales {
    [lang: string]: {[token: string]: string}
  }

  interface PackageJSON {
    name: string
    version: string
    dependencies: {[index: string]: string}
    main: string
  }

  interface Bucket {
    state: string
    lastModified: string
    hash: string
  }

  interface RouteEntry {
    path?: string
    routes?(ctx: {account: string; workspace: string}): Promise<any>
    handler(req, res, ctx): Promise<any>
  }

  interface RouteMap {
    [name: string]: RouteEntry
  }

  interface Timings {[middleware: string]: [number, number]}

  type LogLevel = 'info' | 'error' | 'warn' | 'debug'

  interface React2BuildFile {
    app: string
    entrypointAssetsByEnv: EntrypointAssetsByEnv
    entrypointDependencies: Record<string, string[]>
    linked: boolean
    locales: Locales
    registry: string
    render: string
  }

  interface React1BuildFile {
    app: string
    entrypointAssetsByEnv: EntrypointAssetsByEnv
    entrypointDependencies: Record<string, string[]>
    linked: boolean
    locales: Locales
    registry: string
    render: string
  }

  interface React2QueriesMetaFile {
    [hash: string]: QueryMeta
  }

  interface QueryMeta {
    provider?: string
    typeName: string
  }

  interface Dependencies {
    [appId: string]: string[]
  }

  interface GraphQL1CacheHintsFile {
    [typeName: string]: CacheHints
  }

  interface CacheHints {
    scope: string
    maxAge: string
    version: number
  }

  type ReactBuildFile = React1BuildFile | React2BuildFile

  interface EntrypointAssetsByEnv {
    dev?: EntrypointAssets
    prod?: EntrypointAssets
  }

  interface EntrypointAssets {
    [entrypoint: string]: string[]
  }

  interface PageInfo {
    pages: Pages
    extensions: Extensions
    routes: AppRoutes
    templates: Templates
  }

  type MergeablePageInfo = Pick<PageInfo, 'extensions' | 'routes'>

  interface AppRoutes {
    [routeId: string]: Route
  }

  interface Templates {
    [name: string]: Template
  }

  interface AvailableTemplate {
    id: string
    context: string
  }

  interface Template {
    component: string
    props?: any
    extensions?: Extensions
    context?: string
  }

  interface OldPages0BuildFile {
    pages?: OldPages
    extensions?: Extensions
  }

  interface Pages0BuildFile {
    pages?: Pages
    extensions?: Extensions,
    templates?: Templates,
    routes?: AppRoutes,
  }

  interface ConditionBound {
    label?: string
    url?: string
    device?: string
    conditions?: string[]
    allMatches?: boolean
  }

  interface Pages {
    [routeId: string]: Array<PageConfig & ConditionBound>
  }

  interface DateRange {
    from: string,
    to: string
  }

  interface Condition {
    conditionId: string
    description: string
    expression: boolean
    visualRepresentation: string
    isEnabled: boolean
    isFeatured: boolean
    dateRange: DateRange
    inUse?: boolean
  }

  interface OldPages {
    [name: string]: OldPage
  }

  type ConfigurationDevice = 'desktop' | 'mobile'

  type ConfigurationScope = 'url' | 'route'

  interface UserConfiguration {
    extensions?: Extensions
    template?: string
  }

  interface ExtensionConfig {
    declarer?: string | null
    component?: string
    props?: Record<string, any>
  }

  interface PageConfig {
    declarer?: string
    name?: string
    template?: string
  }

  type ConditionalConfiguration<T extends {}> = T & ConditionBound

  interface ConditionalConfigurations<T extends {}> {
    [id: string]: ConditionalConfiguration<T>
  }

  interface Route {
    path: string
    context?: string
    declarer?: string
    cname?: string
    login?: boolean
    disableExternals?: string[]
    conditional?: boolean
  }

  interface RoutesConfigurations {
    [routeId: string]: RouteConfigurations
  }

  interface RouteConfigurations {
    extensions?: ExtensionsConfig
    pages?: ConditionalConfigurations<PageConfig>
    route?: RouteDetails
  }

  interface ExtensionsConfig {
    [extensionName: string]: ConditionalConfigurations<ExtensionConfig>
  }

  interface RouteDetails {
    path: string
    context?: string
    login?: boolean
  }

  interface OldPage {
    cname?: string
    path: string
    auth?: boolean
    params?: any
    theme?: string
    disableExternals?: string[]
    declarer?: string
    name?: string
  }

  interface AppMeta {
    [appId: string]: AppMetaItem
  }

  type SomePages0BuildFile = Pages0BuildFile | OldPages0BuildFile

  interface AppMetaItem {
    appId: string
    appDependencies: string[]
    build: ReactBuildFile
    messages: Locale
    cacheHints: GraphQL1CacheHintsFile
    pages: SomePages0BuildFile
    queriesMeta: React2QueriesMetaFile
  }

  interface Extensions {
    [name: string]: Extension
  }

  interface ComponentEntry {
    assets: string[]
    dependencies: string[]
  }

  interface Components {
    [locator: string]: ComponentEntry
  }

  interface Candidate<T> {
    appInfo: AppsInfoValue
    value: T
  }

  interface Candidates<T> {
    [key: string]: Candidate<T>
  }

  interface Extension {
    configurationIds?: string[]
    declarer: string | null
    component: string
    props?: any
    shouldRender?: boolean
    ssr?: boolean
  }

  interface ExternalAsset {
    import: string
    global: string
    serverOnly?: boolean
    path?: string
  }

  interface ExtensionConfiguration {
    configurationId: string
    propsJSON: string
    scope: string
    routeId: string
    url: string
    device: string
    conditions: string[]
    allMatches: boolean
  }

  interface ExternalAssetsByEnv {
    dev: ExternalAsset[]
    prod: ExternalAsset[]
  }

  interface UserRouteItem {
    handler: string,
    headers: {[index: string]: string},
    path: string,
    public: boolean
  }

  interface Redirect {
    cacheId?: string
    disabled: boolean
    id: string
    from: string
    to: string
    endDate: Date | string
  }

  interface UserRoute {
    [routeId: string]: UserRouteItem
  }

  interface UserRouteInfo {
    [app: string]: UserRoute
  }

  interface FlatDependencies {
    [app: string]: string[]
  }
}
