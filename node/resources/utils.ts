export const notFound = <T>(fallback: T) => (error: any): T => {
  if (error.response && error.response.status === 404) {
    return fallback
  }
  throw error
}

export const getCurrentDate = ():string => (new Date()).toISOString().split('T')[0]
