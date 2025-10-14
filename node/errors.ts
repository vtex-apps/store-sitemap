export class MultipleSitemapGenerationError extends Error {
  constructor(endDate: string) {
    super()
    this.message = `Sitemap generation already in place\nNext generation available: ${endDate}`
  }
}

export class MultipleCustomRoutesGenerationError extends Error {
  constructor(endDate: string, account: string) {
    super()
    this.message = `Custom routes generation already in progress for account ${account}\nNext generation available: ${endDate}`
  }
}
