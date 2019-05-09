import { Functions } from '@gocommerce/utils'

export const notFound = <T>(fallback: T) => (error: any): T => {
  if (error.response && error.response.status === 404) {
    return fallback
  }
  throw error
}

export const currentDate = ():string => (new Date()).toISOString().split('T')[0]

export const baseDomain = (account: string, workspace: string) => {
  return Functions.isGoCommerceAcc(account)
    ? `${workspace}--${account}.mygocommerce.com`
    : 'portal.vtexcommercestable.com.br'
}

export const baseURL = (account: string, workspace: string) => {
  const protocol = Functions.isGoCommerceAcc(account) ? 'https' : 'http'
  return `${protocol}://${baseDomain(account, workspace)}`
}