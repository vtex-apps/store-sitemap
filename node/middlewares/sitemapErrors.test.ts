import { CatalogSitemapError } from '../errors/CatalogSitemapError'
import { sitemapErrors } from './sitemapErrors'

// Mock a minimal context for testing
const createTestContext = (): Context => {
  return ({
    method: 'GET',
    path: '/sitemap.xml',
    vtex: {
      logger: {
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
      },
    },
  } as unknown) as Context
}

describe('sitemapErrors middleware', () => {
  let context: Context
  let next: jest.Mock

  beforeEach(() => {
    context = createTestContext()
    next = jest.fn()
  })

  it('should call next when no error occurs', async () => {
    await sitemapErrors(context, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(context.status).toBeUndefined()
    expect(context.type).toBeUndefined()
    expect(context.body).toBeUndefined()
  })

  it('should handle CatalogSitemapError with default 500 status', async () => {
    const originalError = new Error('Catalog API error')
    const error = new CatalogSitemapError(
      'Failed to fetch catalog sitemap',
      originalError
    )
    next.mockRejectedValue(error)

    await sitemapErrors(context, next)

    expect(context.status).toBe(500)
    expect(context.type).toBe('text/plain; charset=utf-8')
    expect(context.body).toBe('Error fetching sitemap data')
    expect(context.vtex.logger.error).toHaveBeenCalledWith({
      message: 'Sitemap pipeline error',
      payload: {
        error: error.message,
        method: 'GET',
        originalError: originalError.message,
        path: '/sitemap.xml',
        stack: error.stack,
        statusCode: 500,
      },
    })
  })

  it('should handle CatalogSitemapError with custom HTTP status code', async () => {
    const originalError = {
      message: 'Not Found',
      response: { status: 404 },
    }
    const error = new CatalogSitemapError(
      'Failed to fetch catalog sitemap',
      (originalError as unknown) as Error
    )
    next.mockRejectedValue(error)

    await sitemapErrors(context, next)

    expect(context.status).toBe(404)
    expect(context.type).toBe('text/plain; charset=utf-8')
    expect(context.body).toBe('Error fetching sitemap data')
    expect(context.vtex.logger.error).toHaveBeenCalledWith({
      message: 'Sitemap pipeline error',
      payload: {
        error: error.message,
        method: 'GET',
        originalError: originalError.message,
        path: '/sitemap.xml',
        stack: error.stack,
        statusCode: 404,
      },
    })
  })

  it('should extract status code from error response object', async () => {
    const originalError = {
      message: 'Bad Request',
      response: { status: 400 },
    }
    const error = new CatalogSitemapError(
      'Failed to fetch catalog sitemap',
      (originalError as unknown) as Error
    )
    next.mockRejectedValue(error)

    await sitemapErrors(context, next)

    expect(context.status).toBe(400)
    expect(context.type).toBe('text/plain; charset=utf-8')
    expect(context.body).toBe('Error fetching sitemap data')
    expect(context.vtex.logger.error).toHaveBeenCalledWith({
      message: 'Sitemap pipeline error',
      payload: {
        error: error.message,
        method: 'GET',
        originalError: originalError.message,
        path: '/sitemap.xml',
        stack: error.stack,
        statusCode: 400,
      },
    })
  })

  it('should handle generic errors with 500 status', async () => {
    const error = new Error('Some unexpected error')
    next.mockRejectedValue(error)

    await sitemapErrors(context, next)

    expect(context.status).toBe(500)
    expect(context.type).toBe('text/plain; charset=utf-8')
    expect(context.body).toBe('Internal Server Error')
    expect(context.vtex.logger.error).toHaveBeenCalledWith({
      message: 'Sitemap pipeline error',
      payload: {
        error: error.message,
        method: 'GET',
        path: '/sitemap.xml',
        stack: error.stack,
      },
    })
  })

  it('should log error details with correct structure', async () => {
    const error = new Error('Test error')
    error.stack = 'Error: Test error\n    at Object.<anonymous> (/test.js:1:1)'
    next.mockRejectedValue(error)

    await sitemapErrors(context, next)

    expect(context.vtex.logger.error).toHaveBeenCalledWith({
      message: 'Sitemap pipeline error',
      payload: {
        error: 'Test error',
        method: 'GET',
        path: '/sitemap.xml',
        stack: 'Error: Test error\n    at Object.<anonymous> (/test.js:1:1)',
      },
    })
  })

  it('should set correct content type for CatalogSitemapError', async () => {
    const error = new CatalogSitemapError(
      'Catalog error',
      new Error('Original')
    )
    const testContext = createTestContext()
    const testNext = jest.fn().mockRejectedValue(error)

    await sitemapErrors(testContext, testNext)

    expect(testContext.type).toBe('text/plain; charset=utf-8')
  })

  it('should set correct content type for generic errors', async () => {
    const error = new Error('Generic error')
    const testContext = createTestContext()
    const testNext = jest.fn().mockRejectedValue(error)

    await sitemapErrors(testContext, testNext)

    expect(testContext.type).toBe('text/plain; charset=utf-8')
  })

  it('should set correct content type for TypeError', async () => {
    const error = new TypeError('Type error')
    const testContext = createTestContext()
    const testNext = jest.fn().mockRejectedValue(error)

    await sitemapErrors(testContext, testNext)

    expect(testContext.type).toBe('text/plain; charset=utf-8')
  })
})
