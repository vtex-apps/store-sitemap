import { CatalogSitemapError } from './CatalogSitemapError'

describe('CatalogSitemapError', () => {
  it('should create error with default 500 status code', () => {
    const error = new CatalogSitemapError('Test error')

    expect(error.message).toBe('Test error')
    expect(error.name).toBe('CatalogSitemapError')
    expect(error.statusCode).toBe(500)
    expect(error.originalError).toBeUndefined()
  })

  it('should use default status code when no original error provided', () => {
    const originalError = new Error('Original error')
    const error = new CatalogSitemapError('Test error', originalError)

    expect(error.message).toBe('Test error')
    expect(error.name).toBe('CatalogSitemapError')
    expect(error.statusCode).toBe(500)
    expect(error.originalError).toBe(originalError)
  })

  it('should extract status code from original error response', () => {
    const originalError = {
      message: 'API Error',
      response: { status: 403 },
    }
    const error = new CatalogSitemapError(
      'Test error',
      (originalError as unknown) as Error
    )

    expect(error.message).toBe('Test error')
    expect(error.name).toBe('CatalogSitemapError')
    expect(error.statusCode).toBe(403)
    expect(error.originalError).toBe(originalError)
  })

  it('should default to 500 when original error has no response', () => {
    const originalError = new Error('Simple error')
    const error = new CatalogSitemapError('Test error', originalError)

    expect(error.message).toBe('Test error')
    expect(error.name).toBe('CatalogSitemapError')
    expect(error.statusCode).toBe(500)
    expect(error.originalError).toBe(originalError)
  })

  it('should default to 500 when original error response has no status', () => {
    const originalError = {
      message: 'API Error',
      response: {},
    }
    const error = new CatalogSitemapError(
      'Test error',
      (originalError as unknown) as Error
    )

    expect(error.message).toBe('Test error')
    expect(error.name).toBe('CatalogSitemapError')
    expect(error.statusCode).toBe(500)
    expect(error.originalError).toBe(originalError)
  })
})
