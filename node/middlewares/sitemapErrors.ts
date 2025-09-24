import { CatalogSitemapError } from '../errors/CatalogSitemapError'

/**
 * Error handling middleware specifically for sitemap pipelines.
 * Catches errors and returns appropriate HTTP responses with proper content types
 * instead of allowing errors to bubble up and potentially return XML error content.
 */
export async function sitemapErrors(ctx: Context, next: () => Promise<void>) {
  try {
    await next()
  } catch (error) {
    const {
      vtex: { logger },
    } = ctx

    // Log the error for debugging
    logger.error({
      message: 'Sitemap pipeline error',
      payload: {
        error: error.message,
        method: ctx.method,
        path: ctx.path,
        stack: error.stack,
        ...(error instanceof CatalogSitemapError && {
          statusCode: error.statusCode,
          originalError: error.originalError?.message,
        }),
      },
    })

    // Set content type to text/plain to ensure browsers handle it properly
    ctx.type = 'text/plain; charset=utf-8'

    if (error instanceof CatalogSitemapError) {
      // Use the actual HTTP status code from the catalog API response
      ctx.status = error.statusCode
      ctx.body = 'Error fetching sitemap data'
      return
    }

    // Default error handling for unknown errors
    ctx.status = 500
    ctx.body = 'Internal Server Error'
  }
}
