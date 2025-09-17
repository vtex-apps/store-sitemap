export class CatalogSitemapError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message)
    this.name = 'CatalogSitemapError'
  }
}
