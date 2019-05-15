export interface SiteMap {
  fromLegacy: (forwardedPath: string) => Promise<string>

  replacePath: (str: string, forwardedPath: string) => string

  replaceHost: (str: string, forwardedHost: string) => string
}
