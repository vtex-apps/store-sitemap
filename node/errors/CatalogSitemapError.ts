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

    return (
      'response' in errorObj &&
      errorObj.response !== null &&
      typeof errorObj.response === 'object' &&
      'status' in (errorObj.response as Record<string, unknown>) &&
      typeof (errorObj.response as Record<string, unknown>).status === 'number'
    )
  }
}
