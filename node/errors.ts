export class MultipleSitemapGenerationError extends Error {
  constructor(endDate: string) {
    super()
    this.message = `Sitemap generation already in place\nNext generation available: ${endDate}`
    return
  }
}
