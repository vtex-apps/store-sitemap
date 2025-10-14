interface ErrorWithResponse {
  response?: {
    status?: number
  }
}

export class CatalogSitemapError extends Error {
  public statusCode: number

  constructor(message: string, public originalError?: Error) {
    super(message)
    this.name = 'CatalogSitemapError'

    this.statusCode = this.extractStatusCodeFromError(originalError) ?? 500
  }

  private extractStatusCodeFromError(error?: Error): number | null {
    if (!error) {
      return null
    }

    // Type guard to check if error has response property with status
    if (this.hasResponseWithStatus(error)) {
      return error.response?.status ?? null
    }

    return null
  }

  private hasResponseWithStatus(error: unknown): error is ErrorWithResponse {
    if (!error || typeof error !== 'object') {
      return false
    }

    const errorObj = error as Record<string, unknown>
    const hasResponseProperty = 'response' in errorObj
    if (!hasResponseProperty) {
      return false
    }

    const responseValue = (errorObj as { response?: unknown }).response
    const responseIsNonNullObject =
      typeof responseValue === 'object' && responseValue !== null

    if (!responseIsNonNullObject) {
      return false
    }

    const hasStatusProperty =
      'status' in (responseValue as Record<string, unknown>)

    if (!hasStatusProperty) {
      return false
    }

    const statusValue = (responseValue as { status?: unknown }).status
    const statusIsNumber = typeof statusValue === 'number'

    return statusIsNumber
  }
}
